<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use Illuminate\Http\JsonResponse;
use Illuminate\Support\Facades\Http;

class HardwareController extends Controller
{
    private string $bridgeUrl;
    private string $bridgeSecret;

    public function __construct()
    {
        $this->bridgeUrl = config('app.hardware_bridge_url', env('HARDWARE_BRIDGE_URL', 'http://localhost:5000'));
        $this->bridgeSecret = env('HARDWARE_BRIDGE_SECRET', '');
    }

    /**
     * Status hardware bridge dan kamera.
     */
    public function status(): JsonResponse
    {
        try {
            $response = Http::timeout(3)
                ->withHeaders(['X-Bridge-Secret' => $this->bridgeSecret])
                ->get("{$this->bridgeUrl}/status");

            if ($response->successful()) {
                return response()->json([
                    'data' => array_merge($response->json(), ['bridge_online' => true]),
                ]);
            }

            return response()->json([
                'data' => [
                    'bridge_online' => false,
                    'camera' => 'disconnected',
                    'camera_model' => null,
                    'bluetooth_connected' => false,
                ],
            ]);
        } catch (\Exception $e) {
            return response()->json([
                'data' => [
                    'bridge_online' => false,
                    'camera' => 'disconnected',
                    'camera_model' => null,
                    'bluetooth_connected' => false,
                    'error' => 'Hardware bridge tidak dapat dihubungi.',
                ],
            ]);
        }
    }

    /**
     * Trigger DSLR capture via hardware bridge.
     */
    public function capture(): JsonResponse
    {
        try {
            $response = Http::timeout(15)
                ->withHeaders(['X-Bridge-Secret' => $this->bridgeSecret])
                ->post("{$this->bridgeUrl}/camera/capture");

            if ($response->successful()) {
                return response()->json([
                    'message' => 'Capture berhasil.',
                    'data' => $response->json(),
                ]);
            }

            return response()->json([
                'message' => 'Gagal trigger capture. Periksa koneksi kamera.',
            ], 500);
        } catch (\Exception $e) {
            return response()->json([
                'message' => 'Hardware bridge tidak dapat dihubungi. Pastikan bridge berjalan.',
            ], 503);
        }
    }

    /**
     * Download foto terbaru dari hardware bridge.
     */
    public function latestPhoto(): JsonResponse
    {
        try {
            $response = Http::timeout(30)
                ->withHeaders(['X-Bridge-Secret' => $this->bridgeSecret])
                ->get("{$this->bridgeUrl}/camera/latest");

            if ($response->successful()) {
                return response()->json($response->json());
            }

            return response()->json([
                'message' => 'Tidak ada foto yang tersedia.',
            ], 404);
        } catch (\Exception $e) {
            return response()->json([
                'message' => 'Gagal mengambil foto dari bridge.',
            ], 503);
        }
    }
}
