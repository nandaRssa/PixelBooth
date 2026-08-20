import React, { useState } from "react";
import { Monitor, Maximize } from "lucide-react";
import { toast } from "@/components/ui/Toast";
import {
  getSessionDisplayMode,
  setSessionDisplayMode,
  type SessionDisplayMode,
} from "@/utils/sessionDisplay";

// ==========================================
// PIXELBOOTH — Halaman Pengaturan
// Satu-satunya tempat mengatur mode tampilan Photo Session.
// ==========================================

const DISPLAY_MODES: {
  value: SessionDisplayMode;
  label: string;
  desc: string;
  icon: React.ReactNode;
}[] = [
  {
    value: "default",
    label: "Default",
    desc: "Menggunakan tampilan Photo Session yang sudah ada lengkap dengan navbar dan panel kontrol.",
    icon: <Monitor size={18} />,
  },
  {
    value: "fullscreen",
    label: "Fullscreen",
    desc: "Tampilan khusus photobooth fullscreen template + live camera memenuhi seluruh layar, kontrol minimal.",
    icon: <Maximize size={18} />,
  },
];

const SettingsPage: React.FC = () => {
  const [mode, setMode] = useState<SessionDisplayMode>(getSessionDisplayMode);

  const handleSelect = (value: SessionDisplayMode) => {
    setMode(value);
    setSessionDisplayMode(value);
    toast.success(
      `Mode tampilan: ${value === "default" ? "Default" : "Fullscreen"}.`,
    );
  };

  return (
    <div className="max-w-3xl">
      {/* ===== Header ===== */}
      <div className="mb-6">
        <h1 className="text-pb-text text-2xl font-bold">Pengaturan</h1>
        <p className="text-pb-text-muted text-sm mt-1">
          Konfigurasi aplikasi photobooth. Pilihan disimpan sebelum sesi
          dimulai.
        </p>
      </div>

      {/* ===== Photo Session ===== */}
      <section className="bg-pb-surface border border-pb-border rounded-xl p-5 mb-4">
        <h2 className="text-pb-text text-sm font-semibold mb-1">
          Photo Session
        </h2>
        <p className="text-pb-text-muted text-xs mb-4">
          Display Mode digunakan setiap kali sesi foto dimulai dari menu Photo.
        </p>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {DISPLAY_MODES.map((opt) => {
            const active = mode === opt.value;
            return (
              <button
                key={opt.value}
                type="button"
                onClick={() => handleSelect(opt.value)}
                aria-pressed={active}
                className={`text-left rounded-xl border p-4 transition-all duration-200 ${
                  active
                    ? "border-[#FF5A36] ring-2 ring-[#FF5A36]/30 bg-gradient-to-br from-[#FF5A36]/10 via-[#FF8836]/5 to-transparent shadow-sm"
                    : "border-pb-border hover:border-pb-border-strong bg-pb-bg"
                }`}
              >
                <div className="flex items-center gap-2 mb-1.5">
                  <span
                    className={
                      active ? "text-[#FF5A36]" : "text-pb-text-secondary"
                    }
                  >
                    {opt.icon}
                  </span>
                  <span
                    className={`text-sm font-semibold ${active ? "text-pb-text" : "text-pb-text"}`}
                  >
                    {opt.label}
                  </span>
                  {active && (
                    <span className="ml-auto px-2.5 py-0.5 rounded-md bg-gradient-to-r from-[#FF5A36] to-[#FF8836] text-white text-[11px] font-semibold shadow-xs">
                      Aktif
                    </span>
                  )}
                </div>
                <p className="text-pb-text-muted text-xs leading-relaxed">
                  {opt.desc}
                </p>
              </button>
            );
          })}
        </div>
      </section>
    </div>
  );
};

export default SettingsPage;
