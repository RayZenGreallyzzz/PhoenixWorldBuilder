package com.phoenix3d.builder;

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
import java.util.zip.ZipOutputStream;
import java.util.zip.ZipInputStream;
import java.util.zip.ZipEntry;
import android.graphics.BitmapFactory;

/** Standalone Phoenix 3D: local game construction + GLB avatar. No third-party app dependency. */
public final class PhoenixBuilderActivity extends Activity {
 private static final int PICK_CHARACTER=960, EXPORT_MAP=962, PICK_DECOR=963, SAVE_BUNDLE=964, LOAD_BUNDLE=965;
 private static final long MAX_GLB=48L*1024*1024;
 private File root,model,gameJson,decor,appearance;
 private String decorMime="image/png";
 private WebView view;
 @Override public void onCreate(Bundle state) {
  super.onCreate(state);
  getWindow().setFlags(WindowManager.LayoutParams.FLAG_FULLSCREEN,WindowManager.LayoutParams.FLAG_FULLSCREEN);
  root=new File(getFilesDir(),"phoenix3d");root.mkdirs();
  model=new File(root,"model.glb");
  gameJson=new File(root,"game-scene.json");
  decor=new File(root,"decor.bin");appearance=new File(root,"appearance.json");
  decorMime=getSharedPreferences("phoenix3d.shared",MODE_PRIVATE).getString("decor_mime","image/png");
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
     if("/decor".equals(path)){
      return decor.isFile()?stream(decorMime,null,new FileInputStream(decor)):empty();
     }
     if("/model.glb".equals(path)){
      return model.isFile()?stream("model/gltf-binary",null,new FileInputStream(model)):empty();
     }
     if("/game-scene.json".equals(path)){
      return stream("application/json","utf-8",gameJson.isFile()?
       new FileInputStream(gameJson):new ByteArrayInputStream("{\"version\":1,\"items\":[]}".getBytes(StandardCharsets.UTF_8)));
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
 private static String sniffImage(File file)throws IOException{
  try(InputStream in=new FileInputStream(file)){
   byte[] header=new byte[8];if(in.read(header)!=8)throw new IOException("Пустой PNG/JPG");
   if((header[0]&255)==255&&(header[1]&255)==216)return "image/jpeg";
   if((header[0]&255)==137&&header[1]==80&&header[2]==78&&header[3]==71)return "image/png";
   throw new IOException("Поддерживаются только PNG и JPEG");
  }
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
   }else if(request==PICK_DECOR){
    File incoming=new File(root,"decor-preview.bin");
    try(InputStream in=getContentResolver().openInputStream(uri)){copy(in,incoming,12L*1024*1024);}
    BitmapFactory.Options check=new BitmapFactory.Options();check.inJustDecodeBounds=true;
    BitmapFactory.decodeFile(incoming.getAbsolutePath(),check);
    String mime=sniffImage(incoming);
    if(check.outWidth<1||check.outHeight<1||check.outWidth>8192||check.outHeight>8192){
     incoming.delete();throw new IOException("Повреждённый рисунок или разрешение больше 8192");
    }
    if(decor.exists())decor.delete();
    if(!incoming.renameTo(decor))throw new IOException("Не удалось сохранить декор");
    decorMime=mime;
    getSharedPreferences("phoenix3d.shared",MODE_PRIVATE).edit().putString("decor_mime",decorMime).apply();
    info("Новый рисунок добавлен в строительный режим.");
    view.loadUrl("https://phoenix3d.local/game.html");
   }else if(request==SAVE_BUNDLE){
    try(OutputStream output=getContentResolver().openOutputStream(uri)){
     if(output==null)throw new IOException("Нельзя записать в выбранную папку");
     writeBundle(output);
    }
    info("Игровой проект с персонажем и декором экспортирован в ZIP.");
   }else if(request==LOAD_BUNDLE){
    try(InputStream input=getContentResolver().openInputStream(uri)){
     if(input==null)throw new IOException("Нельзя открыть архив");
     loadBundle(input);
    }
    info("Персонаж, игровая карта и декор восстановлены.");
    view.loadUrl("https://phoenix3d.local/game.html");
   }else if(request==EXPORT_MAP){
    if(!gameJson.isFile()){info("Сначала построй хоть один модуль");return;}
    try(InputStream in=new FileInputStream(gameJson);
        OutputStream out=getContentResolver().openOutputStream(uri)){
     byte[] buf=new byte[32768];int n;while((n=in.read(buf))!=-1)out.write(buf,0,n);
    }
    info("Игровая карта экспортирована в JSON.");
   }
  }catch(Exception e){info("Ошибка: "+e.getMessage());}
 }
 private void writeBundle(OutputStream output)throws IOException{
  File[] files={model,gameJson,decor,appearance};
  try(ZipOutputStream archive=new ZipOutputStream(output)){
   byte[] block=new byte[32768];
   for(File file:files){
    if(!file.isFile())continue;
    archive.putNextEntry(new ZipEntry(file.getName()));
    try(InputStream input=new FileInputStream(file)){
     int n;while((n=input.read(block))!=-1)archive.write(block,0,n);
    }
    archive.closeEntry();
   }
  }
 }
 private void loadBundle(InputStream file)throws IOException{
  int seen=0;
  try(ZipInputStream archive=new ZipInputStream(file)){
   ZipEntry entry;
   while((entry=archive.getNextEntry())!=null){
    String name=entry.getName();File target;long limit;
    if("model.glb".equals(name)){target=model;limit=MAX_GLB;}
    else if("game-scene.json".equals(name)){target=gameJson;limit=1024L*1024;}
    else if("decor.bin".equals(name)){target=decor;limit=12L*1024*1024;}
    else if("appearance.json".equals(name)){target=appearance;limit=65536;}
    else throw new IOException("Недопустимый файл в проекте: "+name);
    copy(archive,target,limit);archive.closeEntry();
    if(target.equals(decor)){
     decorMime=sniffImage(decor);
     getSharedPreferences("phoenix3d.shared",MODE_PRIVATE).edit().putString("decor_mime",decorMime).apply();
    }
    seen++;
    if(seen>4)throw new IOException("Слишком много файлов в проекте");
   }
  }
  if(seen==0)throw new IOException("Игровой проект пустой");
 }
 public final class GameBridge{
  @JavascriptInterface public void chooseCharacter(){
   runOnUiThread(()->choose(PICK_CHARACTER,"*/*"));
  }
  @JavascriptInterface public void chooseDecor(){
   runOnUiThread(()->choose(PICK_DECOR,"image/*"));
  }
  @JavascriptInterface public void saveBundle(){
   runOnUiThread(()->{
    Intent i=new Intent(Intent.ACTION_CREATE_DOCUMENT);
    i.addCategory(Intent.CATEGORY_OPENABLE);i.setType("application/zip");
    i.putExtra(Intent.EXTRA_TITLE,"Phoenix3D_PlayBuild_Project.zip");
    startActivityForResult(i,SAVE_BUNDLE);
   });
  }
  @JavascriptInterface public void loadBundle(){
   runOnUiThread(()->choose(LOAD_BUNDLE,"application/zip"));
  }
  @JavascriptInterface public void exportGameMap(){
   runOnUiThread(()->{
    Intent i=new Intent(Intent.ACTION_CREATE_DOCUMENT);
    i.setType("application/json");i.addCategory(Intent.CATEGORY_OPENABLE);
    i.putExtra(Intent.EXTRA_TITLE,"Phoenix3D_GameMap.json");
    startActivityForResult(i,EXPORT_MAP);
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
