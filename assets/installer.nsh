; Extra install step for the download wizard (nsis-web).
; electron-builder downloads the app package over HTTPS but does not check it, so this compares the
; package's SHA-512 with the value built into the wizard and removes the install if they differ.
!macro customInstall
  !ifdef APP_PACKAGE_STORE_FILE
    ${StdUtils.HashFile} $R8 "SHA2-512" "$LOCALAPPDATA\${APP_PACKAGE_STORE_FILE}"
    ${if} $R8 != "${APP_64_HASH}"
      ExecWait '"$INSTDIR\${UNINSTALL_FILENAME}" /S _?=$INSTDIR'
      Delete "$LOCALAPPDATA\${APP_PACKAGE_STORE_FILE}"
      RMDir /r "$INSTDIR"
      MessageBox MB_OK|MB_ICONSTOP "The downloaded app package failed its integrity check, so it was not installed.$\r$\n$\r$\nDownload the setup wizard again from the official site." /SD IDOK
      SetErrorLevel 3
      Quit
    ${endif}
  !endif
!macroend
