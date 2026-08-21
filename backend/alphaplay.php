<?php
// Test: transfer mask alpha into photo via imagecopy with alphablending
$w = 100; $h = 100;
$photo = imagecreatetruecolor($w, $h);
imagealphablending($photo, false);
imagesavealpha($photo, true);
$red = imagecolorallocate($photo, 255, 0, 0);
imagefilledrectangle($photo, 0, 0, $w-1, $h-1, $red); // opaque red

$mask = imagecreatetruecolor($w, $h);
imagealphablending($mask, false);
imagesavealpha($mask, true);
$t = imagecolorallocatealpha($mask, 0, 0, 0, 127);
imagefilledrectangle($mask, 0, 0, $w-1, $h-1, $t);
$white = imagecolorallocatealpha($mask, 255, 255, 255, 0);
imagefilledellipse($mask, 50, 50, 60, 60, $white); // opaque white circle center

// Now composite: copy mask onto photo with blending enabled
imagealphablending($photo, true);
imagecopy($photo, $mask, 0, 0, 0, 0, $w, $h);

function px($img, $x, $y) {
    $c = imagecolorat($img, $x, $y);
    $a = ($c >> 24) & 0x7F;
    $r = ($c >> 16) & 0xFF; $g = ($c >> 8) & 0xFF; $b = $c & 0xFF;
    return "rgba($r,$g,$b,$a)";
}
echo "center (inside circle): ".px($photo, 50, 50)."\n";
echo "corner (outside circle): ".px($photo, 5, 5)."\n";
echo "edge (inside circle): ".px($photo, 30, 50)."\n";
echo "outside near circle: ".px($photo, 10, 50)."\n";
