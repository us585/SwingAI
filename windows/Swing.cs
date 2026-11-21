using System;
using System.Diagnostics;
using System.Drawing;
using System.IO;
using System.Net;
using System.Windows.Forms;
using Microsoft.Win32;

internal static class Swing {
    const string DefaultAddress="192.168.1.87:3000";
    static bool Valid(string input,out string address) {
        address=null; Uri uri;
        string value=input.Trim();
        if(!value.StartsWith("http://",StringComparison.OrdinalIgnoreCase))value="http://"+value;
        if(!Uri.TryCreate(value,UriKind.Absolute,out uri)||uri.Scheme!="http"||uri.UserInfo!=""||uri.AbsolutePath!="/"||uri.Query!=""||uri.Fragment!=""||uri.Port<1||uri.Port>65535)return false;
        IPAddress ip;
        if(uri.Host.Equals("localhost",StringComparison.OrdinalIgnoreCase)){address="localhost:"+uri.Port;return true;}
        if(!IPAddress.TryParse(uri.Host,out ip)||ip.AddressFamily!=System.Net.Sockets.AddressFamily.InterNetwork)return false;
        var b=ip.GetAddressBytes();
        if(!(b[0]==127||b[0]==10||(b[0]==192&&b[1]==168)||(b[0]==172&&b[1]>=16&&b[1]<=31)))return false;
        address=ip.ToString()+":"+uri.Port;return true;
    }
    static string FindEdge() {
        foreach(var root in new[]{Registry.CurrentUser,Registry.LocalMachine}) {
            foreach(string sub in new[]{@"SOFTWARE\Microsoft\Windows\CurrentVersion\App Paths\msedge.exe",@"SOFTWARE\WOW6432Node\Microsoft\Windows\CurrentVersion\App Paths\msedge.exe"}) {
                using(var key=root.OpenSubKey(sub)){var path=key==null?null:key.GetValue(null) as string;if(!String.IsNullOrEmpty(path)&&File.Exists(path))return path;}
            }
        }
        foreach(var folder in new[]{Environment.GetFolderPath(Environment.SpecialFolder.ProgramFilesX86),Environment.GetFolderPath(Environment.SpecialFolder.ProgramFiles),Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData)}) {
            var path=Path.Combine(folder,@"Microsoft\Edge\Application\msedge.exe");if(File.Exists(path))return path;
        }
        return null;
    }
    [STAThread] static int Main(string[] args) {
        if(args.Length==1&&args[0]=="--self-test") {
            string s; return Valid(DefaultAddress,out s)&&s==DefaultAddress&&!Valid("https://evil.example",out s)&&!Valid("8.8.8.8:3000",out s)?0:1;
        }
        Application.EnableVisualStyles(); Application.SetCompatibleTextRenderingDefault(false);
        try {
            string address=DefaultAddress;
            string edge=FindEdge();
            if(edge==null){MessageBox.Show("Swing needs Microsoft Edge to display the app. Install Microsoft Edge and try again.","Swing",MessageBoxButtons.OK,MessageBoxIcon.Information);return 1;}
            Process.Start(new ProcessStartInfo{FileName=edge,Arguments="--app=http://"+address+"/",UseShellExecute=true});
            return 0;
        } catch(Exception){MessageBox.Show("Swing could not open. Check that the PC running Swing is on, then try again.","Swing",MessageBoxButtons.OK,MessageBoxIcon.Error);return 1;}
    }
}
