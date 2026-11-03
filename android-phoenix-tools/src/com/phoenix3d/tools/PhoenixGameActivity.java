package com.phoenix3d.tools;

import android.app.Activity;
import android.os.Bundle;
import android.content.Intent;
import android.net.Uri;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.JavascriptInterface;
import android.view.WindowManager;
import android.widget.Toast;
import org.json.JSONObject;
import org.json.JSONArray;
import java.io.*;
import java.nio.charset.StandardCharsets;

/**
 * Play-and-build mode with a custom GLB avatar and native Android file picker.
 *
 * This runs in the same installed Planner APK and shares the Phoenix Tools
 * model folder, but it does NOT yet inject a model into Planner's proprietary
 * native libGDX scene. Its game-map JSON is stored independently for safety.
 */
public final class PhoenixGameActivity extends Activity {
 private static final int PICK_CHARACTER=960, PICK_PROJECT=961, EXPORT_MAP=962;
 private static final long MAX_GLB=48L*1024*1024;
 private File root,model,plannerJson,gameJson;
 private WebView view;
 @Override public void onCreate(Bundle state) {
  super.onCreate(state);
  getWindow().setFlags(WindowManager.LayoutParams.FLAG_FULLSCREEN,WindowManager.LayoutParams.FLAG_FULLSCREEN);
  root=new File(getFilesDir(),"phoenix3d");root.mkdirs();
  model=new File(root,"model.glb");
  plannerJson=new File(root,"planner-project.json");
  gameJson=new File(root,"game-scene.json");
  view=new WebView(this);
  WebSettings settings=view.getSettings();
  settings.setJavaScriptEnabled(true);
  settings.setDomStorageEnabled(false);
  settings.setAllowFileAccess(false);
  settings.setAllowContentAccess(false);
  settings.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
  view.addJavascriptInterface(new GameBridge(),"GameBridge");
  view.setWebViewClient(new WebViewClient(){
   @Override public WebResourceResponse shouldInterceptRequest(WebView v,WebResourceRequest request){
    Uri uri=request.getUrl();
    if(!"https".equals(uri.getScheme())||!"phoenix3d.local".equals(uri.getHost()))
     return empty();
    String path=uri.getPath();
    if(path==null)return empty();
    try{
     if("/model.glb".equals(path)){
      return model.isFile()?stream("model/gltf-binary",null,new FileInputStream(model)):empty();
     }
     if("/game-scene.json".equals(path)){
      return stream("application/json","utf-8",gameJson.isFile()?
       new FileInputStream(gameJson):new ByteArrayInputStream("{\"version\":1,\"items\":[]}".getBytes(StandardCharsets.UTF_8)));
     }
     if("/planner-project.json".equals(path)){
      return stream("application/json","utf-8",plannerJson.isFile()?
       new FileInputStream(plannerJson):new ByteArrayInputStream("{}".getBytes(StandardCharsets.UTF_8)));
     }
     if(!path.matches("/[a-zA-Z0-9._-]+"))return empty();
     String name=path.substring(1);
     String mime=name.endsWith(".js")?"application/javascript":"text/html";
     return stream(mime,"utf-8",getAssets().open("phoenix3d/"+name));
    }catch(Exception e){return empty();}
   }
   @Override public boolean shouldOverrideUrlLoading(WebView v,WebResourceRequest request){
    return !"phoenix3d.local".equals(request.getUrl().getHost());
   }
  });
  setContentView(view);
  view.loadUrl("https://phoenix3d.local/game.html");
 }
 private static WebResourceResponse empty(){
  return stream("text/plain","utf-8",new ByteArrayInputStream(new byte[0]));
 }
 private static WebResourceResponse stream(String mime,String encoding,InputStream src){
  return new WebResourceResponse(mime,encoding,src);
 }
 private void info(String message){runOnUiThread(()->Toast.makeText(this,message,Toast.LENGTH_LONG).show());}
 private void choose(int request,String type){
  Intent i=new Intent(Intent.ACTION_OPEN_DOCUMENT);
  i.setType(type);i.addCategory(Intent.CATEGORY_OPENABLE);
  startActivityForResult(i,request);
 }
 private long copy(InputStream src,File target,long limit)throws IOException{
  File tmp=new File(root,target.getName()+".incoming");
  long n=0;byte[] block=new byte[32768];
  try(OutputStream out=new FileOutputStream(tmp)){
   int count;
   while((count=src.read(block))!=-1){
    n+=count;
    if(n>limit)throw new IOException("Слишком большой файл (лимит "+(limit/1048576)+" МиБ)");
    out.write(block,0,count);
   }
  }catch(IOException error){tmp.delete();throw error;}
  if(target.exists()&&!target.delete())throw new IOException("Нет доступа для обновления файла");
  if(!tmp.renameTo(target))throw new IOException("Не удалось сохранить файл");
  return n;
 }
 @Override protected void onActivityResult(int request,int result,Intent data){
  super.onActivityResult(request,result,data);
  if(result!=RESULT_OK||data==null||data.getData()==null)return;
  try{
   Uri uri=data.getData();
   if(request==PICK_CHARACTER){
    File incoming=new File(root,"character-test.glb");
    try(InputStream in=getContentResolver().openInputStream(uri)){copy(in,incoming,MAX_GLB);}
    try(RandomAccessFile f=new RandomAccessFile(incoming,"r")){
     if(f.length()<20||f.readInt()!=0x676c5446)throw new IOException("Выбран не бинарный GLB glTF 2.0");
    }catch(Exception e){incoming.delete();throw e;}
    if(model.exists())model.delete();
    if(!incoming.renameTo(model))throw new IOException("Не удалось заменить персонажа");
    info("Персонаж GLB загружен. Перезапускаю игровой режим.");
    view.loadUrl("https://phoenix3d.local/game.html");
   }else if(request==PICK_PROJECT){
    File incoming=new File(root,"planner-test.json");
    try(InputStream in=getContentResolver().openInputStream(uri)){copy(in,incoming,8L*1024*1024);}
    JSONObject json;
    try(InputStream in=new FileInputStream(incoming)){
     ByteArrayOutputStream out=new ByteArrayOutputStream();byte[] buf=new byte[16384];int n;
     while((n=in.read(buf))!=-1)out.write(buf,0,n);
     json=new JSONObject(out.toString("UTF-8"));
    }
    if(!"Project".equals(json.optString("className"))||!(json.optJSONArray("items") instanceof JSONArray)){
     incoming.delete();throw new IOException("Файл не является JSON-проектом Planner 5D");
    }
    if(plannerJson.exists())plannerJson.delete();
    if(!incoming.renameTo(plannerJson))throw new IOException("Не удалось сохранить план");
    info("Проект Planner импортирован для игрового просмотра. Исходник не изменён.");
    view.loadUrl("https://phoenix3d.local/game.html");
   }else if(request==EXPORT_MAP){
    if(!gameJson.isFile()){info("Сначала построй хоть один модуль");return;}
    try(InputStream in=new FileInputStream(gameJson);
        OutputStream out=getContentResolver().openOutputStream(uri)){
     byte[] buf=new byte[32768];int n;while((n=in.read(buf))!=-1)out.write(buf,0,n);
    }
    info("Игровая карта экспортирована в JSON. Она НЕ заменяет проект Planner.");
   }
  }catch(Exception e){info("Ошибка: "+e.getMessage());}
 }
 public final class GameBridge{
  @JavascriptInterface public void chooseCharacter(){
   runOnUiThread(()->choose(PICK_CHARACTER,"*/*"));
  }
  @JavascriptInterface public void choosePlannerJson(){
   runOnUiThread(()->choose(PICK_PROJECT,"application/json"));
  }
  @JavascriptInterface public void exportGameMap(){
   runOnUiThread(()->{
    Intent i=new Intent(Intent.ACTION_CREATE_DOCUMENT);
    i.setType("application/json");i.addCategory(Intent.CATEGORY_OPENABLE);
    i.putExtra(Intent.EXTRA_TITLE,"Phoenix3D_GameMap.json");
    startActivityForResult(i,EXPORT_MAP);
   });
  }
  @JavascriptInterface public void openNativeBuilder(){
   runOnUiThread(()->{
    try{
     Intent i=new Intent();i.setClassName(getPackageName(),"com.planner5d.library.activity.Main");
     startActivity(i);
    }catch(Exception e){info("Не получилось открыть редактор: "+e.getMessage());}
   });
  }
  @JavascriptInterface public synchronized void saveScene(String raw){
   try{
    if(raw==null||raw.length()>1024*1024)throw new IOException("Карта слишком большая");
    JSONObject obj=new JSONObject(raw);
    if(obj.optInt("version")!=1)throw new IOException("Неверная версия карты");
    JSONArray items=obj.optJSONArray("items");
    if(items==null||items.length()>500)throw new IOException("Превышен лимит деталей");
    File tmp=new File(root,"game-scene.tmp");
    try(OutputStream out=new FileOutputStream(tmp)){
     out.write(obj.toString().getBytes(StandardCharsets.UTF_8));
    }
    if(gameJson.exists()&&!gameJson.delete())throw new IOException("Нельзя заменить сохранение");
    if(!tmp.renameTo(gameJson))throw new IOException("Нельзя записать сохранение");
   }catch(Exception e){info("Не удалось сохранить карту: "+e.getMessage());}
  }
 }
 @Override protected void onPause(){if(view!=null)view.onPause();super.onPause();}
 @Override protected void onResume(){super.onResume();if(view!=null)view.onResume();}
 @Override protected void onDestroy(){if(view!=null){view.destroy();view=null;}super.onDestroy();}
}
