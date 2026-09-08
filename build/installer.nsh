; 卸载时删除用户配置数据目录（Electron userData，即 %APPDATA%\konstantion-of-league）
; 目录名只取决于 package.json 的 name（productName 不会改变 userData）
!macro customUnInstall
  RMDir /r "$APPDATA\konstantion-of-league"
!macroend
