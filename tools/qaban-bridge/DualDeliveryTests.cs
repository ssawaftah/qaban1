using System;
using System.IO;
using System.Net;
using System.Net.Sockets;
using System.Text;
using System.Collections.Generic;
using System.Threading.Tasks;
using System.Diagnostics;

namespace WeighbridgeBridge {
 public static class DualDeliveryTests {
  static int checks;
  static void Check(bool ok,string label){if(!ok)throw new Exception("FAIL: "+label);checks++;}
  sealed class MiniServer:IDisposable {
   readonly TcpListener listener;readonly Func<string,Task<Tuple<int,string>>> handler;
   public string Url {get;private set;}
   public readonly List<string> Bodies=new List<string>();public readonly List<bool> HasBearer=new List<bool>();
   public MiniServer(Func<string,Task<Tuple<int,string>>> handler){this.handler=handler;listener=new TcpListener(IPAddress.Loopback,0);listener.Start();Url="http://127.0.0.1:"+((IPEndPoint)listener.LocalEndpoint).Port+"/";Accept();}
   async void Accept(){try{while(true){var client=await listener.AcceptTcpClientAsync();Serve(client);}}catch(ObjectDisposedException){}catch(SocketException){}}
   async void Serve(TcpClient client){using(client){try{var stream=client.GetStream();var reader=new StreamReader(stream,Encoding.ASCII,false,1024,true);int length=0;bool expect=false,auth=false;string line;
    while((line=await reader.ReadLineAsync())!=null&&line!=""){if(line.StartsWith("Authorization: Bearer ",StringComparison.OrdinalIgnoreCase))auth=true;if(line.StartsWith("Content-Length:",StringComparison.OrdinalIgnoreCase))length=int.Parse(line.Substring(15).Trim());if(line.StartsWith("Expect:",StringComparison.OrdinalIgnoreCase)&&line.IndexOf("100-continue",StringComparison.OrdinalIgnoreCase)>=0)expect=true;}
    if(expect){byte[] interim=Encoding.ASCII.GetBytes("HTTP/1.1 100 Continue\r\n\r\n");await stream.WriteAsync(interim,0,interim.Length);await stream.FlushAsync();}
    if(length>4096)throw new Exception("Oversized test input");char[] body=new char[length];int count=0,n;while(count<length&&(n=await reader.ReadAsync(body,count,length-count))>0)count+=n;string json=new string(body,0,count);lock(Bodies){Bodies.Add(json);HasBearer.Add(auth);}
    var response=await handler(json);byte[] bytes=Encoding.UTF8.GetBytes(response.Item2);byte[] head=Encoding.ASCII.GetBytes("HTTP/1.1 "+response.Item1+" Response\r\nContent-Type: application/json\r\nContent-Length: "+bytes.Length+"\r\nConnection: close\r\n\r\n");await stream.WriteAsync(head,0,head.Length);await stream.WriteAsync(bytes,0,bytes.Length);
   }catch(IOException){}catch(ObjectDisposedException){}catch(SocketException){}}}
   public void Dispose(){listener.Stop();}
  }
  static async Task Wait(Task task){if(await Task.WhenAny(task,Task.Delay(6000))!=task)throw new Exception("Test timeout");await task;}
  public static int Run(){try{RunAsync().GetAwaiter().GetResult();Console.WriteLine("PASS: "+checks+" dual-output isolation/credential checks");return 0;}catch(Exception ex){Console.WriteLine(ex);return 1;}}
  static async Task RunAsync(){
   checks=0;long now=0;var gate=new TaskCompletionSource<bool>();bool hold=true;
   using(var primaryServer=new MiniServer(body=>Task.FromResult(Tuple.Create(200,"{\"success\":\"Weight scale updated successfully\"}"))))
   using(var returnsServer=new MiniServer(async body=>{if(hold)await gate.Task;var obj=new System.Web.Script.Serialization.JavaScriptSerializer().Deserialize<System.Collections.Generic.Dictionary<string,object>>(body);return Tuple.Create(200,"{\"accepted\":true,\"weightKg\":"+obj["weightKg"]+"}");})){
    var primary=new OutputChannel(OutputKind.Primary,"primary",()=>now,null,null);
    var returns=new OutputChannel(OutputKind.Returns,"returns",()=>now,null,null);
    primary.Configure(primaryServer.Url,"","1",3000,true);returns.Configure(returnsServer.Url,"test-only-not-a-production-key","1",3000,true);
    Check(primary.Ready&&returns.Ready,"two independent valid configurations");
    primary.Pump(now,true,now,DateTime.UtcNow,10);returns.Pump(now,true,now,DateTime.UtcNow,10);
    await Wait(primary.Pending);Check(primary.Feedback.ServerText=="تم التحديث","primary succeeds while second response held");
    Check(returns.Busy,"held second request still pending");
    now=1100;primary.Pump(now,true,now,DateTime.UtcNow,20);returns.Pump(now,true,now,DateTime.UtcNow,20);
    await Wait(primary.Pending);Check(primaryServer.Bodies.Count==2,"primary sends next frame while returns busy");
    Check(returnsServer.Bodies.Count==1,"second does not enqueue or overlap");
    hold=false;gate.TrySetResult(true);await Wait(returns.Pending);
    now=2200;returns.Pump(now,true,now,DateTime.UtcNow,30);await Wait(returns.Pending);
    Check(returnsServer.Bodies.Count==2&&returnsServer.Bodies[1].Contains(":30,"),"second resumes with newest frame, no stale queue");
    Check(returns.Feedback.ServerText=="تم التحديث","returns echo acknowledgement validated");
    Check(!primaryServer.HasBearer[0]&&returnsServer.HasBearer[0],"returns token not leaked to primary");
    Check(primaryServer.Bodies[0]==Protocol.Payload("1",10),"primary contract unchanged");
    Check(!returnsServer.Bodies[0].Contains("company_id")&&returnsServer.Bodies[0].Contains("sampledAt"),"returns contract isolated");
    now=3300;returns.Pump(now,true,0,DateTime.UtcNow,40);Check(returnsServer.Bodies.Count==2,"stale sample not sent to returns");
    returns.Configure(returnsServer.Url,"","1",3000,true);Check(!returns.Ready&&returns.ConfigurationError=="رمز API مطلوب","missing second token is explicit");
    now=4400;primary.Pump(now,true,now,DateTime.UtcNow,50);await Wait(primary.Pending);Check(primaryServer.Bodies.Count==3,"missing second token does not stop primary");
    returns.Configure("not-a-url","secret","1",3000,true);Check(!returns.Ready,"bad second URL isolated");
    primary.Stop();returns.Stop();Check(!primary.Ready&&!returns.Ready,"stop shuts both channels");
   }
   now=0;
   using(var healthy=new MiniServer(body=>Task.FromResult(Tuple.Create(200,"{\"accepted\":true,\"weightKg\":0}"))))
   using(var failing=new MiniServer(body=>Task.FromResult(Tuple.Create(500,"{\"error\":\"Failed to update weight scale\"}")))){
    var first=new OutputChannel(OutputKind.Primary,"primary",()=>now,null,null);var second=new OutputChannel(OutputKind.Returns,"returns",()=>now,null,null);
    first.Configure(failing.Url,"","1",3000,true);second.Configure(healthy.Url,"local-test-key","1",3000,true);
    first.Pump(0,true,0,DateTime.UtcNow,0);second.Pump(0,true,0,DateTime.UtcNow,0);await Wait(Task.WhenAll(first.Pending,second.Pending));
    Check(first.Feedback.ServerError&&first.Feedback.ServerText.Contains("500"),"primary HTTP500 is not hidden");
    Check(second.Feedback.ServerText=="تم التحديث"&&!second.Feedback.ServerError,"returns succeeds despite primary error");
    now=1100;first.Pump(now,true,now,DateTime.UtcNow,0);second.Pump(now,true,now,DateTime.UtcNow,0);await Wait(Task.WhenAll(first.Pending,second.Pending));
    Check(healthy.Bodies.Count==2&&failing.Bodies.Count==2,"both resend zero every second independently");
    first.Stop();second.Stop();
   }
   Check(OutputChannel.ReturnsAccepted("{\"accepted\":true,\"weightKg\":16480}",16480),"returns acknowledgement accepts matching weight");
   Check(!OutputChannel.ReturnsAccepted("{\"accepted\":true,\"weightKg\":12}",16480),"different echoed weight cannot confirm");
   Check(!OutputChannel.ReturnsAccepted("{\"accepted\":false,\"weightKg\":16480}",16480),"false returns acknowledgement rejected");
   Check(ResponseRules.ExplicitFailure("{\"accepted\":false}"),"accepted false surfaced as error");
   string protectedToken=LocalSecrets.Protect("test-only-local-token");Check(protectedToken!="test-only-local-token"&&LocalSecrets.Unprotect(protectedToken)=="test-only-local-token","credential protected roundtrip");
   Check(LocalSecrets.Unprotect("invalid-protected-value")=="","broken credential fails closed");
   string temp=Path.Combine(Path.GetTempPath(),"qaban-bootstrap-"+Guid.NewGuid().ToString("N"));Directory.CreateDirectory(temp);
   try{
    string secret="local-bootstrap-test-key-not-production";
    File.WriteAllText(Path.Combine(temp,"Returns.setup.json"),new System.Web.Script.Serialization.JavaScriptSerializer().Serialize(new ReturnsSetup{Endpoint="https://qaban-113.pages.dev/api/scale/weight",Token=secret}));
    var settings=new Settings{Endpoint="https://primary.example.test/api/weight",Company="3"};string destination=Path.Combine(temp,"profile","settings.json");
    Check(Bootstrap.Import(temp,destination,settings),"optional private setup imported");
    Check(!File.Exists(Path.Combine(temp,"Returns.setup.json")),"plaintext provisioning removed after import");
    Check(settings.Endpoint=="https://primary.example.test/api/weight"&&settings.Company=="3","bootstrap preserves original destination");
    Check(settings.ReturnsEnabled&&LocalSecrets.Unprotect(settings.ReturnsTokenProtected)==secret,"provisioned secret protected for local user");
    Check(!File.ReadAllText(destination).Contains(secret),"settings never contain plaintext provisioning token");
   }finally{Directory.Delete(temp,true);}

  }
 }
}
