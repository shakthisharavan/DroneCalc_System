# electron-builder unconditionally copies the installer to %LOCALAPPDATA%\<name>-updater\installer.exe
# (differential-update cache) and never removes it. DroneCalc does not auto-update, so drop it.
!macro customInstall
  Delete "$LOCALAPPDATA\dronecalc-updater\installer.exe"
  RMDir "$LOCALAPPDATA\dronecalc-updater"
!macroend
