param([ValidateSet('capture','click')][string]$Action, [int]$X = 0, [int]$Y = 0)
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing
Add-Type @'
using System;
using System.Runtime.InteropServices;
public class SwingDesktop {
  [DllImport("user32.dll")] public static extern bool SetProcessDPIAware();
  [DllImport("user32.dll")] public static extern bool SetCursorPos(int x, int y);
  [DllImport("user32.dll")] public static extern void mouse_event(uint flags, uint x, uint y, uint data, UIntPtr extra);
}
'@
[SwingDesktop]::SetProcessDPIAware() | Out-Null
# Give the owner time to bring the intended window to the front.
Start-Sleep -Seconds 5
$bounds = [System.Windows.Forms.Screen]::PrimaryScreen.Bounds
if ($Action -eq 'click') {
  if ($X -lt 0 -or $Y -lt 0 -or $X -ge $bounds.Width -or $Y -ge $bounds.Height) { throw 'Click outside primary screen.' }
  [SwingDesktop]::SetCursorPos($X, $Y) | Out-Null
  [SwingDesktop]::mouse_event(2,0,0,0,[UIntPtr]::Zero)
  [SwingDesktop]::mouse_event(4,0,0,0,[UIntPtr]::Zero)
  '{"ok":true}'
} else {
  $bitmap = New-Object System.Drawing.Bitmap($bounds.Width, $bounds.Height)
  $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
  $stream = New-Object System.IO.MemoryStream
  try {
    $graphics.CopyFromScreen($bounds.Location,[System.Drawing.Point]::Empty,$bounds.Size)
    $bitmap.Save($stream,[System.Drawing.Imaging.ImageFormat]::Png)
    @{width=$bounds.Width;height=$bounds.Height;image=[Convert]::ToBase64String($stream.ToArray())} | ConvertTo-Json -Compress
  } finally { $graphics.Dispose(); $bitmap.Dispose(); $stream.Dispose() }
}
