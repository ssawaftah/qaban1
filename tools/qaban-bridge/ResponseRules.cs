using System;
using System.Collections;
using System.Collections.Generic;
using System.Web.Script.Serialization;

namespace WeighbridgeBridge {
 // A configurable acknowledgement must match a whole text response or the
 // typed fields of a JSON object. Substring matching can accept failure text.
 public static class ResponseRules {
  public static bool IsHtml(string media,string body){return (media??"").IndexOf("html",StringComparison.OrdinalIgnoreCase)>=0||(body??"").TrimStart().StartsWith("<",StringComparison.Ordinal);}
  public static bool Matches(string body,string expected){
   if(string.IsNullOrWhiteSpace(expected))return false;
   string e=expected.Trim(),b=(body??"").Trim();
   if(e.StartsWith("{",StringComparison.Ordinal)){
    try{
     var serializer=new JavaScriptSerializer();
     var pattern=serializer.DeserializeObject(e) as Dictionary<string,object>;
     if(pattern==null||pattern.Count==0)return false;
     return ContainsPattern(serializer.DeserializeObject(b),pattern);
    }catch{return false;}
   }
   // Plain text acknowledgement: exact match, never a substring.
   return string.Equals(b,e,StringComparison.Ordinal);
  }
  public static bool KnownSuccess(string body){return Matches(body,"{\"success\":\"Weight scale updated successfully\"}");}
  public static bool ExplicitFailure(string body){
   try{var value=new JavaScriptSerializer().DeserializeObject(body) as Dictionary<string,object>;if(value==null)return false;
    object accepted;if(value.TryGetValue("accepted",out accepted)&&accepted is bool&&!(bool)accepted)return true;
    object success;if(value.TryGetValue("success",out success)&&success is bool&&!(bool)success)return true;
    object error;return value.TryGetValue("error",out error)&&error!=null&&!(error is bool&&!(bool)error)&&!string.IsNullOrWhiteSpace(Convert.ToString(error));
   }catch{return false;}
  }
  static bool ContainsPattern(object actual,object expected){
   var pattern=expected as Dictionary<string,object>;
   if(pattern!=null){
    var obj=actual as Dictionary<string,object>;if(obj==null)return false;
    foreach(var item in pattern){object value;if(!obj.TryGetValue(item.Key,out value)||!ContainsPattern(value,item.Value))return false;}
    return true;
   }
   var list=expected as object[];
   if(list!=null){var values=actual as object[];if(values==null||list.Length!=values.Length)return false;for(int i=0;i<list.Length;i++)if(!ContainsPattern(values[i],list[i]))return false;return true;}
   if(expected==null)return actual==null;
   if(actual==null)return false;
   // JSON numeric CLR representations can differ between int/long/decimal.
   if(IsNumber(actual)&&IsNumber(expected))return Convert.ToDecimal(actual)==Convert.ToDecimal(expected);
   return actual.GetType()==expected.GetType() && actual.Equals(expected);
  }
  static bool IsNumber(object value){return value is int||value is long||value is decimal||value is double||value is float;}
 }
 public sealed class DeliverySchedule {
  public long NextAttempt {get;private set;}
  public int Failures {get;private set;}
  bool hasConfirmed;decimal confirmed;
  public bool NeedsSend(decimal weight){return !hasConfirmed||weight!=confirmed;}
  public void Confirm(decimal weight){confirmed=weight;hasConfirmed=true;}
  public void Reset(){Failures=0;NextAttempt=0;hasConfirmed=false;}
  public bool CanSend(long now,bool running,bool enabled,bool fresh,bool busy){return running&&enabled&&fresh&&!busy&&now>=NextAttempt;}
  public void PeriodicStart(long now,int interval){NextAttempt=now+interval;}
  public void PeriodicSuccess(){Failures=0;}
  public int PeriodicFailure(long now,int serverDelay){Failures=Math.Min(Failures+1,20);int delay=Math.Min(300000,Math.Max(0,serverDelay));if(delay>0)NextAttempt=Math.Max(NextAttempt,now+delay);return delay;}
  public void Success(long now,int interval){Failures=0;NextAttempt=now+interval;}
  public int Failed(long now,int serverDelay){Failures=Math.Min(Failures+1,20);int delay=Math.Max(Math.Min(30000,2000*(1<<Math.Min(4,Failures-1))),Math.Min(300000,Math.Max(0,serverDelay)));NextAttempt=now+delay;return delay;}
 }
 public sealed class TransferFeedback {
  public string SendText {get;private set;}
  public string ServerText {get;private set;}
  public bool Written {get;private set;}
  public bool ServerError {get;private set;}
  public TransferFeedback(){Reset();}
  public void Reset(){Written=false;ServerError=false;SendText="بانتظار الوزن";ServerText="—";}
  public void Begin(){Written=false;if(SendText!="تم الإرسال")SendText="جارٍ الإرسال";}
  public void BodyWritten(){Written=true;SendText="تم الإرسال";ServerText="بانتظار الرد";ServerError=false;}
  public void Reply(int code,bool acknowledged,bool html,bool failure){
   SendText=Written?"تم الإرسال":"لم يُؤكد الإرسال";
   ServerError=code<200||code>=300||html||failure;
   ServerText=ServerError?("HTTP "+code+(html?" · HTML":failure?" · خطأ":"")):acknowledged?"تم التحديث":"HTTP "+code;
  }
  public void NoReply(){SendText=Written?"تم الإرسال":"لم يتم الاتصال";ServerText="لم يصل رد";ServerError=true;}
 }
 public static class ReadingPolicy {
  public static bool IsFresh(long now,long received,int freshness){return received>=0&&now>=received&&now-received<=freshness;}
  public static int Deadline(long now,long received,int freshness){return (int)Math.Max(1,Math.Min(8000,freshness-(now-received)));}
 }
}
