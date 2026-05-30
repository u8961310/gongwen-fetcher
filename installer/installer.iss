#define MyAppName "公文附件下載器"

[Setup]
AppName={#MyAppName}
AppVersion=1.0.0
AppPublisher=陳冠廷
DefaultDirName={localappdata}\Programs\{#MyAppName}
DisableProgramGroupPage=yes
PrivilegesRequired=lowest
LicenseFile={#Bundle}\授權說明.txt
OutputDir=D:\code
OutputBaseFilename=公文附件下載器-安裝
Compression=lzma2/max
SolidCompression=yes
WizardStyle=modern
ArchitecturesAllowed=x64compatible
ArchitecturesInstallIn64BitMode=x64compatible

[Languages]
Name: "zhhant"; MessagesFile: "ChineseTraditional.isl"

[Files]
Source: "{#Bundle}\*"; DestDir: "{app}"; Flags: recursesubdirs createallsubdirs ignoreversion

[Tasks]
Name: "dailytask"; Description: "每天早上 08:00 自動下載新公文附件"
Name: "runnow"; Description: "安裝完成後立即執行一次"

[Icons]
Name: "{userdesktop}\{#MyAppName}"; Filename: "{app}\執行.bat"; WorkingDir: "{app}"
Name: "{userprograms}\{#MyAppName}\{#MyAppName}"; Filename: "{app}\執行.bat"; WorkingDir: "{app}"
Name: "{userprograms}\{#MyAppName}\移除 {#MyAppName}"; Filename: "{uninstallexe}"

[Run]
Filename: "{app}\runtime\node\node.exe"; Parameters: "src\writeEnvFromFile.js .setup-input.txt"; WorkingDir: "{app}"; Flags: runhidden
Filename: "{cmd}"; Parameters: "/c schtasks /Create /TN ""公文附件下載器"" /TR ""\""{app}\run.bat\"""" /SC DAILY /ST 08:00 /F"; Flags: runhidden; Tasks: dailytask
Filename: "{app}\執行.bat"; Description: "立即執行一次"; Flags: postinstall nowait skipifsilent; Tasks: runnow

[UninstallRun]
Filename: "{cmd}"; Parameters: "/c schtasks /Delete /TN ""公文附件下載器"" /F"; Flags: runhidden; RunOnceId: "DelGongwenTask"

[Code]
var
  InputPage: TInputQueryWizardPage;
  DirPage: TInputDirWizardPage;

procedure InitializeWizard;
begin
  InputPage := CreateInputQueryPage(wpSelectDir,
    '公文系統設定', '請輸入你的公文系統登入資訊',
    '這些資料只會存在你這台電腦，用來自動登入下載附件。');
  InputPage.Add('登入網址（例 https://校名.cyberhood.net.tw/tw/）：', False);
  InputPage.Add('帳號：', False);
  InputPage.Add('密碼：', True);

  DirPage := CreateInputDirPage(InputPage.ID,
    '存放資料夾', '附件要下載到哪個資料夾',
    '可按「瀏覽」選擇：', False, '');
  DirPage.Add('');
  DirPage.Values[0] := 'D:\公文附件';
end;

function NextButtonClick(CurPageID: Integer): Boolean;
begin
  Result := True;
  if CurPageID = InputPage.ID then
  begin
    if (Trim(InputPage.Values[0]) = '') or (Trim(InputPage.Values[1]) = '')
       or (Trim(InputPage.Values[2]) = '') then
    begin
      MsgBox('網址、帳號、密碼都必須填寫。', mbError, MB_OK);
      Result := False;
    end;
  end;
end;

procedure CurStepChanged(CurStep: TSetupStep);
var
  Lines: TArrayOfString;
begin
  if CurStep = ssPostInstall then
  begin
    SetArrayLength(Lines, 4);
    Lines[0] := InputPage.Values[0];
    Lines[1] := InputPage.Values[1];
    Lines[2] := InputPage.Values[2];
    Lines[3] := DirPage.Values[0];
    SaveStringsToUTF8File(ExpandConstant('{app}\.setup-input.txt'), Lines, False);
  end;
end;
