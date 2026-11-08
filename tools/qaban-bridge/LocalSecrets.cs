using System;
using System.Text;
using System.Security.Cryptography;
namespace WeighbridgeBridge {
 public static class LocalSecrets {
  static readonly byte[] Entropy=Encoding.UTF8.GetBytes("QabanAlGhad local API credential v1");
  public static string Protect(string value){if(string.IsNullOrWhiteSpace(value))return "";return Convert.ToBase64String(ProtectedData.Protect(Encoding.UTF8.GetBytes(value),Entropy,DataProtectionScope.CurrentUser));}
  public static string Unprotect(string value){if(string.IsNullOrWhiteSpace(value))return "";try{return Encoding.UTF8.GetString(ProtectedData.Unprotect(Convert.FromBase64String(value),Entropy,DataProtectionScope.CurrentUser));}catch{return "";}}
 }
}
