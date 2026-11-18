' AeroKin Invisible Background Launcher
' Starts the AeroKin PowerShell supervisor completely hidden (WindowStyle 0)
Option Explicit

Dim objFSO, objShell, strScriptDir, strPs1, strWorkDir, strArgs, i

Set objFSO = CreateObject("Scripting.FileSystemObject")
strScriptDir = objFSO.GetParentFolderName(WScript.ScriptFullName)

If objFSO.FileExists(objFSO.BuildPath(strScriptDir, "scripts\aerokin-launcher.ps1")) Then
    strPs1 = objFSO.BuildPath(strScriptDir, "scripts\aerokin-launcher.ps1")
    strWorkDir = strScriptDir
ElseIf objFSO.FileExists(objFSO.BuildPath(strScriptDir, "aerokin-launcher.ps1")) Then
    strPs1 = objFSO.BuildPath(strScriptDir, "aerokin-launcher.ps1")
    strWorkDir = objFSO.GetParentFolderName(strScriptDir)
Else
    strPs1 = objFSO.BuildPath(strScriptDir, "..\scripts\aerokin-launcher.ps1")
    strWorkDir = objFSO.GetParentFolderName(strScriptDir)
End If

strArgs = ""
For i = 0 To WScript.Arguments.Count - 1
    strArgs = strArgs & " """ & WScript.Arguments(i) & """"
Next

Set objShell = CreateObject("WScript.Shell")
objShell.CurrentDirectory = strWorkDir
' Run hidden: WindowStyle 0, bWaitOnReturn = False
objShell.Run "powershell.exe -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File """ & strPs1 & """" & strArgs, 0, False
