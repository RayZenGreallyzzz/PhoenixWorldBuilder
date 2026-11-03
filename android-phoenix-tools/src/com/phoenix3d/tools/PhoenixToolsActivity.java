package com.phoenix3d.tools;
import android.app.Activity;
import android.os.Bundle;
import android.content.Intent;
import android.graphics.BitmapFactory;
import android.net.Uri;
import android.view.ViewGroup;
import android.widget.Button;
import android.widget.EditText;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.TextView;
import android.webkit.JavascriptInterface;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.webkit.WebSettings;
import java.io.*;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.Base64;
import java.util.zip.ZipEntry;
import java.util.zip.ZipInputStream;
import java.util.zip.ZipOutputStream;

/** Optional offline tools activity in the same APK as Planner, not a hook into Planner's 3D room. */
public final class PhoenixToolsActivity extends Activity {
 private static final int PICK_GLB=601,PICK_DECOR=602,SAVE_ZIP=603,LOAD_ZIP=604;
 private final long MAX_MODEL=48L*1024*1024,MAX_DECOR=12L*1024*1024;
 private File root,model,decor,appearance,pendingBackup;
 private WebView viewer;private TextView status;
 private EditText endpoint,username,password;private String decorMime="image/png";
 @Override public void onCreate(Bundle state){
  super.onCreate(state);
  root=new File(getFilesDir(),"phoenix3d");model=new File(root,"model.glb");
  decor=new File(root,"decor.bin");appearance=new File(root,"appearance.json");root.mkdirs();
  decorMime=getPreferences(0).getString("decor_mime","image/png");
  ScrollView scroll=new ScrollView(this);
  LinearLayout body=new LinearLayout(this);body.setOrientation(1);
  int m=dp(12);body.setPadding(m,m,m,m);scroll.addView(body);
  TextView title=new TextView(this);title.setText("Phoenix 3D — личные модели и декор");
  title.setTextSize(21);body.addView(title);
  TextView help=new TextView(this);
  help.setText("Работает локально. Это дополнительный редактор внутри Planner. Перенос GLB в строительную сцену Planner пока не поддерживается.");
  body.addView(help);
  button(body,"🏠 Открыть строительство Planner",()->{
   Intent i=new Intent();i.setClassName(getPackageName(),"com.planner5d.library.activity.Main");
   startActivity(i);
  });
  button(body,"🎮 Игровая стройка с GLB-персонажем",()->{
   startActivity(new Intent(this,PhoenixGameActivity.class));
  });
  button(body,"📂 Выбрать персонажа или модуль GLB (до 48 МБ)",()->openFile(PICK_GLB,"*/*"));
  button(body,"🎨 Выбрать PNG/JPG для декора (до 12 МБ)",()->openFile(PICK_DECOR,"image/*"));
  status=new TextView(this);status.setText("GLB и декор хранятся только на этом устройстве.");
  body.addView(status);
  viewer=new WebView(this);
  WebSettings ws=viewer.getSettings();ws.setJavaScriptEnabled(true);
  ws.setDomStorageEnabled(false);ws.setAllowFileAccess(false);
  ws.setAllowContentAccess(false);ws.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
  viewer.addJavascriptInterface(new EditorBridge(),"PhoenixBridge");
  viewer.setWebViewClient(new WebViewClient(){
   @Override public WebResourceResponse shouldInterceptRequest(WebView v,WebResourceRequest request){
    Uri uri=request.getUrl();if(!"phoenix3d.local".equals(uri.getHost()))return errorResponse();
    try{
     String p=uri.getPath();if(p==null)return errorResponse();
     if("/model.glb".equals(p)){
      return model.isFile()?new WebResourceResponse("model/gltf-binary",null,new FileInputStream(model)):errorResponse();
     }
     if("/decor".equals(p)){
      return decor.isFile()?new WebResourceResponse(decorMime,null,new FileInputStream(decor)):errorResponse();
     }
     if("/appearance.json".equals(p)){
      return new WebResourceResponse("application/json","utf-8",
       appearance.isFile()?new FileInputStream(appearance):new ByteArrayInputStream("{}".getBytes(StandardCharsets.UTF_8)));
     }
     if(!p.matches("/[a-zA-Z0-9._-]+"))return errorResponse();
     String file=p.substring(1);
     String mime=file.endsWith(".js")?"application/javascript":"text/html";
     return new WebResourceResponse(mime,"utf-8",getAssets().open("phoenix3d/"+file));
    }catch(Exception e){return errorResponse();}
   }
   @Override public boolean shouldOverrideUrlLoading(WebView v,WebResourceRequest request){
    return !"phoenix3d.local".equals(request.getUrl().getHost());
   }
  });
  body.addView(viewer,new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT,dp(390)));
  TextView cloudTitle=new TextView(this);
  cloudTitle.setText("Своё облако (необязательно, только HTTPS/WebDAV)");
  cloudTitle.setTextSize(17);body.addView(cloudTitle);
  endpoint=field(body,"URL папки WebDAV, например https://cloud.example/remote.php/dav/files/user/Phoenix3D/",false);
  username=field(body,"Логин WebDAV",false);
  password=field(body,"Пароль приложения WebDAV — не сохраняется",true);
  endpoint.setText(getPreferences(0).getString("webdav_url",""));
  username.setText(getPreferences(0).getString("webdav_user",""));
  button(body,"☁ Загрузить резервную копию моих GLB и декора",()->uploadWebDav());
  button(body,"☁ Восстановить мои GLB и декор из WebDAV",()->downloadWebDav());
  button(body,"💾 Сохранить резервную копию в память Android",()->{
   try{
    pendingBackup=makeBackup();Intent i=new Intent(Intent.ACTION_CREATE_DOCUMENT);
    i.setType("application/zip");i.addCategory(Intent.CATEGORY_OPENABLE);
    i.putExtra(Intent.EXTRA_TITLE,"Phoenix3D-assets.zip");startActivityForResult(i,SAVE_ZIP);
   }catch(Exception e){showError(e);}
  });
  button(body,"📥 Восстановить мои GLB и декор из ZIP",()->openFile(LOAD_ZIP,"application/zip"));
  setContentView(scroll);refreshViewer();
 }
 private int dp(int p){return (int)(getResources().getDisplayMetrics().density*p+0.5f);}
 private void button(LinearLayout parent,String text,Runnable click){
  Button b=new Button(this);b.setText(text);parent.addView(b);b.setOnClickListener(v->click.run());
 }
 private EditText field(LinearLayout parent,String hint,boolean secret){
  EditText e=new EditText(this);e.setSingleLine(true);e.setHint(hint);
  if(secret)e.setInputType(129);parent.addView(e);return e;
 }
 private void msg(String s){runOnUiThread(()->status.setText(s));}
 private void showError(Exception e){msg("Ошибка: "+e.getMessage());}
 private void openFile(int code,String mime){
  Intent i=new Intent(Intent.ACTION_OPEN_DOCUMENT);i.setType(mime);
  i.addCategory(Intent.CATEGORY_OPENABLE);startActivityForResult(i,code);
 }
 private static WebResourceResponse errorResponse(){
  return new WebResourceResponse("text/plain","utf-8",new ByteArrayInputStream(new byte[0]));
 }
 private void refreshViewer(){viewer.loadUrl("https://phoenix3d.local/index.html");}
 private long copyBounded(InputStream in,File target,long limit)throws IOException{
  target.getParentFile().mkdirs();File tmp=new File(target.getParentFile(),target.getName()+".tmp");
  long n=0;byte[] b=new byte[65536];
  try(OutputStream out=new FileOutputStream(tmp)){
   int c;while((c=in.read(b))!=-1){n+=c;if(n>limit)throw new IOException("Файл больше допустимого размера");out.write(b,0,c);}
  }catch(IOException error){tmp.delete();throw error;}
  if(target.exists()&&!target.delete())throw new IOException("Не удалось заменить файл");
  if(!tmp.renameTo(target))throw new IOException("Не удалось сохранить файл");
  return n;
 }
 @Override protected void onActivityResult(int code,int result,Intent data){
  super.onActivityResult(code,result,data);
  if(result!=RESULT_OK||data==null||data.getData()==null)return;Uri uri=data.getData();
  try{
   if(code==PICK_GLB){
    File staged=new File(root,"incoming.glb");
    try(InputStream in=getContentResolver().openInputStream(uri)){copyBounded(in,staged,MAX_MODEL);}
    try(RandomAccessFile raf=new RandomAccessFile(staged,"r")){
     byte[] magic=new byte[4];raf.readFully(magic);
     if(magic[0]!='g'||magic[1]!='l'||magic[2]!='T'||magic[3]!='F')
      throw new IOException("Это не бинарный файл GLB (glTF 2.0)");
    }catch(IOException error){staged.delete();throw error;}
    if(model.exists())model.delete();
    if(!staged.renameTo(model))throw new IOException("Не удалось завершить импорт GLB");
    appearance.delete();msg("GLB импортирован локально. Выбери текстуру и нанеси её на модель.");refreshViewer();
   }else if(code==PICK_DECOR){
    try(InputStream in=getContentResolver().openInputStream(uri)){copyBounded(in,decor,MAX_DECOR);}
    BitmapFactory.Options opt=new BitmapFactory.Options();opt.inJustDecodeBounds=true;
    BitmapFactory.decodeFile(decor.getAbsolutePath(),opt);
    if(opt.outWidth<1||opt.outHeight<1||opt.outWidth>8192||opt.outHeight>8192){
     decor.delete();throw new IOException("Изображение повреждено или слишком большое");
    }
    decorMime="image/jpeg".equals(getContentResolver().getType(uri))?"image/jpeg":"image/png";
    getPreferences(0).edit().putString("decor_mime",decorMime).apply();
    msg("Текстура добавлена. Выбери инструмент в 3D-окне и коснись поверхности.");refreshViewer();
   }else if(code==SAVE_ZIP){
    if(pendingBackup==null)pendingBackup=makeBackup();
    try(InputStream in=new FileInputStream(pendingBackup);OutputStream out=getContentResolver().openOutputStream(uri)){transfer(in,out);}
    msg("Резервная копия сохранена локально.");
   }else if(code==LOAD_ZIP){
    try(InputStream in=getContentResolver().openInputStream(uri)){restore(in);}
    msg("Локальные модели и декор восстановлены.");refreshViewer();
   }
  }catch(Exception e){showError(e);}
 }
 private static void transfer(InputStream in,OutputStream out)throws IOException{
  byte[] b=new byte[65536];int n;while((n=in.read(b))!=-1)out.write(b,0,n);
 }
 private File makeBackup()throws IOException{
  File archive=new File(getCacheDir(),"Phoenix3D-assets.zip");
  try(ZipOutputStream out=new ZipOutputStream(new FileOutputStream(archive))){
   for(File f:new File[]{model,decor,appearance}){
    if(!f.isFile())continue;out.putNextEntry(new ZipEntry(f.getName()));
    try(InputStream in=new FileInputStream(f)){transfer(in,out);}out.closeEntry();
   }
  }return archive;
 }
 private void restore(InputStream file)throws IOException{
  try(ZipInputStream zip=new ZipInputStream(file)){
   ZipEntry entry;while((entry=zip.getNextEntry())!=null){
    File target;
    if("model.glb".equals(entry.getName()))target=model;
    else if("decor.bin".equals(entry.getName()))target=decor;
    else if("appearance.json".equals(entry.getName()))target=appearance;
    else throw new IOException("Неожиданный файл в архиве: "+entry.getName());
    long limit=target.equals(model)?MAX_MODEL:target.equals(decor)?MAX_DECOR:65536;
    copyBounded(zip,target,limit);zip.closeEntry();
   }
  }
 }
 private void uploadWebDav(){
  String url=endpoint.getText().toString().trim(),login=username.getText().toString(),pwd=password.getText().toString();
  if(!url.startsWith("https://")){msg("WebDAV требует адрес HTTPS");return;}
  getPreferences(0).edit().putString("webdav_url",url).putString("webdav_user",login).apply();
  msg("Подготовка резервной копии…");
  new Thread(()->{
   try{
    File backup=makeBackup();
    URL dest=new URL(url.endsWith("/")?url+"Phoenix3D-assets.zip":url+"/Phoenix3D-assets.zip");
    HttpURLConnection c=(HttpURLConnection)dest.openConnection();
    c.setRequestMethod("PUT");c.setConnectTimeout(12000);c.setReadTimeout(30000);
    c.setDoOutput(true);c.setRequestProperty("Content-Type","application/zip");
    c.setInstanceFollowRedirects(false);
    if(!login.isEmpty()){
     String encoded=Base64.getEncoder().encodeToString((login+":"+pwd).getBytes(StandardCharsets.UTF_8));
     c.setRequestProperty("Authorization","Basic "+encoded);
    }
    c.setFixedLengthStreamingMode(backup.length());
    try(InputStream in=new FileInputStream(backup);OutputStream out=c.getOutputStream()){transfer(in,out);}
    int status=c.getResponseCode();c.disconnect();
    if(status==200||status==201||status==204)msg("WebDAV: резервная копия загружена ("+status+")");
    else msg("WebDAV не принял файл: HTTP "+status+". Проверь права на папку.");
   }catch(Exception e){showError(e);}
  },"PhoenixDavBackup").start();
 }
 private void downloadWebDav(){
  String url=endpoint.getText().toString().trim(),login=username.getText().toString(),pwd=password.getText().toString();
  if(!url.startsWith("https://")){msg("WebDAV требует адрес HTTPS");return;}
  getPreferences(0).edit().putString("webdav_url",url).putString("webdav_user",login).apply();
  msg("Загрузка резервной копии из своего WebDAV…");
  new Thread(()->{
   try{
    URL dest=new URL(url.endsWith("/")?url+"Phoenix3D-assets.zip":url+"/Phoenix3D-assets.zip");
    HttpURLConnection c=(HttpURLConnection)dest.openConnection();
    c.setRequestMethod("GET");c.setConnectTimeout(12000);c.setReadTimeout(30000);
    c.setInstanceFollowRedirects(false);
    if(!login.isEmpty()){
     String encoded=Base64.getEncoder().encodeToString((login+":"+pwd).getBytes(StandardCharsets.UTF_8));
     c.setRequestProperty("Authorization","Basic "+encoded);
    }
    int code=c.getResponseCode();
    if(code!=200)throw new IOException("WebDAV GET: HTTP "+code);
    try(InputStream in=c.getInputStream()){restore(in);}finally{c.disconnect();}
    msg("Мои GLB и текстуры восстановлены из WebDAV.");
    runOnUiThread(()->refreshViewer());
   }catch(Exception e){showError(e);}
  },"PhoenixDavRestore").start();
 }
 @Override protected void onPause(){if(viewer!=null)viewer.onPause();super.onPause();}
 @Override protected void onResume(){super.onResume();if(viewer!=null)viewer.onResume();}
 public final class EditorBridge {
  @JavascriptInterface public void saveAppearance(String json){
   try{
    if(json==null||json.length()>65536)throw new IOException("Слишком большой конфиг декора");
    org.json.JSONObject check=new org.json.JSONObject(json);
    try(OutputStream out=new FileOutputStream(appearance)){
     out.write(check.toString().getBytes(StandardCharsets.UTF_8));
    }
   }catch(Exception e){showError(e);}
  }
 }
 @Override protected void onDestroy(){if(viewer!=null){viewer.destroy();viewer=null;}super.onDestroy();}
}
