using System;
using System.IO;
using System.Web.Script.Serialization;
namespace WeighbridgeBridge {
 public sealed class ReturnsSetup {public string Endpoint,Token;}
 public static class Bootstrap {
  public static bool Import(string applicationDir,string settingsPath,Settings settings){
   string file=Path.Combine(applicationDir,"Returns.setup.json");if(!File.Exists(file))return false;
   if(new FileInfo(file).Length>4096)throw new InvalidDataException("Invalid setup file.");
   var setup=new JavaScriptSerializer().Deserialize<ReturnsSetup>(File.ReadAllText(file));
   if(setup==null||setup.Endpoint!="https://qaban-113.pages.dev/api/scale/weight"||string.IsNullOrWhiteSpace(setup.Token)||setup.Token.Length<24)throw new InvalidDataException("Invalid returns setup.");
   settings.ReturnsEndpoint=setup.Endpoint;settings.ReturnsTokenProtected=LocalSecrets.Protect(setup.Token);settings.ReturnsEnabled=true;
   Directory.CreateDirectory(Path.GetDirectoryName(settingsPath));
   File.WriteAllText(settingsPath,new JavaScriptSerializer().Serialize(settings));
   File.Delete(file);return true;
  }
 }
}
