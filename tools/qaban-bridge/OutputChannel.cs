using System;
using System.Net;
using System.Globalization;
using System.Threading.Tasks;

namespace WeighbridgeBridge {
 public enum OutputKind { Primary, Returns }
 public sealed class OutputChannel {
  public readonly TransferFeedback Feedback=new TransferFeedback();
  public readonly DeliverySchedule Schedule=new DeliverySchedule();
  public bool Busy {get;private set;}
  public bool Ready {get;private set;}
  public string ConfigurationError {get;private set;}
  public Task Pending {get;private set;}
  readonly OutputKind kind;readonly string name;readonly Func<long> clock;
  readonly Action<string> log;readonly Action<ApiReply,string> save;
  HttpWebRequest active;int generation;string endpoint,bearer,company;int freshness;
  public OutputChannel(OutputKind kind,string name,Func<long> clock,Action<string> log,Action<ApiReply,string> save){this.kind=kind;this.name=name;this.clock=clock;this.log=log;this.save=save;Pending=Task.FromResult(0);}
  public void Configure(string url,string token,string companyId,int freshnessMs,bool allowLoopback=false){
   Stop();Feedback.Reset();Schedule.Reset();Ready=false;ConfigurationError=null;
   Uri uri;
   if(!Uri.TryCreate(url,UriKind.Absolute,out uri)||uri.UserInfo!=""||uri.Fragment!=""||uri.Query!=""||
      (uri.Scheme!="https"&&!(allowLoopback&&uri.Scheme=="http"&&uri.Host=="127.0.0.1"))){ConfigurationError="عنوان غير صالح";return;}
   if(kind==OutputKind.Returns&&string.IsNullOrWhiteSpace(token)){ConfigurationError="رمز API مطلوب";return;}
   endpoint=url;bearer=token;company=companyId;freshness=freshnessMs;Ready=true;
  }
  public void Stop(){generation++;Ready=false;if(active!=null){try{active.Abort();}catch{ }}active=null;}
  public void Pump(long now,bool enabled,long received,DateTime sampledAtUtc,decimal weight){
   bool recent=ReadingPolicy.IsFresh(now,received,freshness);
   if(!Ready||!Schedule.CanSend(now,true,enabled,recent,Busy))return;
   Schedule.PeriodicStart(now,1000);Pending=Send(weight,received,sampledAtUtc,generation);
  }
  public static string ReturnsPayload(decimal weight,DateTime sampledAtUtc){return "{\"weightKg\":"+weight.ToString(CultureInfo.InvariantCulture)+",\"sampledAt\":\""+sampledAtUtc.ToUniversalTime().ToString("o",CultureInfo.InvariantCulture)+"\"}";}
  public static bool ReturnsAccepted(string body,decimal weight){return ResponseRules.Matches(body,"{\"accepted\":true,\"weightKg\":"+weight.ToString(CultureInfo.InvariantCulture)+"}");}
  async Task Send(decimal weight,long received,DateTime sampledAtUtc,int gen){
   Busy=true;Feedback.Begin();HttpWebRequest request=null;
   try{
    string payload=kind==OutputKind.Primary?Protocol.Payload(company,weight):ReturnsPayload(weight,sampledAtUtc);
    var reply=await ApiTransport.SendAsync(endpoint,payload,bearer,ReadingPolicy.Deadline(clock(),received,freshness),r=>{request=r;active=r;},()=>{if(Ready&&gen==generation)Feedback.BodyWritten();});
    if(!Ready||gen!=generation)return;
    bool html=ResponseRules.IsHtml(reply.MediaType,reply.Body),failure=ResponseRules.ExplicitFailure(reply.Body);
    bool accepted=kind==OutputKind.Primary?ResponseRules.KnownSuccess(reply.Body):ReturnsAccepted(reply.Body,weight);
    Feedback.Reply(reply.StatusCode,accepted,html,failure);
    if(reply.StatusCode<200||reply.StatusCode>=300||html||failure){if(save!=null)save(reply,kind==OutputKind.Primary?"last-error.txt":"last-error-returns.txt");Schedule.PeriodicFailure(clock(),reply.RetryAfterMilliseconds);if(log!=null)log("["+name+"] HTTP "+reply.StatusCode);}
    else{Schedule.PeriodicSuccess();if(!accepted&&save!=null)save(reply,kind==OutputKind.Primary?"response.txt":"response-returns.txt");}
   }catch(WebException ex){if(ex.Response!=null)ex.Response.Dispose();if(Ready&&gen==generation){Feedback.NoReply();Schedule.PeriodicFailure(clock(),0);if(log!=null)log("["+name+"] "+ex.Status);}}
   catch(Exception ex){if(Ready&&gen==generation){Feedback.NoReply();Schedule.PeriodicFailure(clock(),0);if(log!=null)log("["+name+"] "+ex.GetType().Name);}}
   finally{if(active==request)active=null;Busy=false;}
  }
 }
}
