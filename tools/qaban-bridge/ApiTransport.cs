using System;
using System.IO;
using System.Net;
using System.Text;
using System.Threading;
using System.Threading.Tasks;

namespace WeighbridgeBridge {
 public sealed class ApiReply {
  public int StatusCode,RetryAfterMilliseconds;
  public string MediaType,Body;
 }
 public static class ApiTransport {
  public static async Task<ApiReply> SendAsync(string endpoint,string json,string bearer,int timeoutMs,Action<HttpWebRequest> onRequest,Action onWritten=null) {
   var request=(HttpWebRequest)WebRequest.Create(endpoint);
   request.Method="POST";request.AllowAutoRedirect=false;request.ContentType="application/json";request.Accept="application/json";request.KeepAlive=false;
   ServicePointManager.SecurityProtocol=SecurityProtocolType.Tls12;request.ServicePoint.Expect100Continue=true;
   if(!string.IsNullOrWhiteSpace(bearer))request.Headers[HttpRequestHeader.Authorization]="Bearer "+bearer.Trim();
   byte[] bytes=Encoding.UTF8.GetBytes(json);request.ContentLength=bytes.Length;if(onRequest!=null)onRequest(request);
   using(var timeout=new CancellationTokenSource(Math.Max(1,timeoutMs)))using(timeout.Token.Register(()=>request.Abort())) {
    using(var stream=await request.GetRequestStreamAsync())await stream.WriteAsync(bytes,0,bytes.Length);
    if(onWritten!=null)onWritten();
    HttpWebResponse response;
    try{response=(HttpWebResponse)await request.GetResponseAsync();}
    catch(WebException ex){response=ex.Response as HttpWebResponse;if(response==null)throw;}
    using(response){
     int seconds;var reply=new ApiReply{StatusCode=(int)response.StatusCode,MediaType=response.ContentType??"",Body=""};
     if(int.TryParse(response.Headers["Retry-After"],out seconds)&&seconds>0)reply.RetryAfterMilliseconds=(int)Math.Min(300000L,(long)seconds*1000);
     if(reply.StatusCode>=300&&reply.StatusCode<400)return reply;
     using(var reader=new StreamReader(response.GetResponseStream())){
      char[] buffer=new char[8193];int count=0,n;
      while(count<buffer.Length&&(n=await reader.ReadAsync(buffer,count,buffer.Length-count))>0)count+=n;
      if(count>8192&&reply.StatusCode<400)throw new InvalidDataException("Response exceeds 8192 characters.");
      reply.Body=new string(buffer,0,Math.Min(count,8192));
     }
     return reply;
    }
   }
  }
 }
}
