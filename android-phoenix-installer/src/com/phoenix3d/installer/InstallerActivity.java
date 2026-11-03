package com.phoenix3d.installer;

import android.app.Activity;
import android.os.Bundle;
import android.app.PendingIntent;
import android.content.Intent;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.pm.PackageInstaller;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.Build;
import android.provider.Settings;
import android.view.Gravity;
import android.view.ViewGroup;
import android.widget.Button;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.TextView;
import java.io.InputStream;
import java.io.OutputStream;
import java.io.IOException;
import java.util.zip.ZipFile;
import java.util.zip.ZipEntry;

/**
 * One ordinary Android APK (no SAI/XAPK manager required) containing all 9
 * correctly signed split APKs. On first launch, asks the user to install the
 * target app through the Android system PackageInstaller UI.
 *
 * This is NOT a merged/universal APK: the target app is still the 9-split
 * full existing building engine + optional Phoenix 3D game tools. No root is required.
 */
public final class InstallerActivity extends Activity {
 static final String TARGET="com.planner5d.planner5d";
 static final String[] SPLITS={
   "com.planner5d.planner5d.apk",
   "config.arm64_v8a.apk",
   "config.armeabi_v7a.apk",
   "config.hdpi.apk","config.mdpi.apk","config.tvdpi.apk",
   "config.xhdpi.apk","config.xxhdpi.apk","config.xxxhdpi.apk"
 };
 static final String EXTRA_MESSAGE="com.phoenix3d.installer.MESSAGE";
 private TextView info;
 private Button install;
 private boolean busy=false;
 @Override public void onCreate(Bundle state){
  super.onCreate(state);
  ScrollView scroll=new ScrollView(this);
  LinearLayout body=new LinearLayout(this);
  body.setPadding(px(18),px(24),px(18),px(18));
  body.setOrientation(LinearLayout.VERTICAL);scroll.addView(body);
  TextView title=new TextView(this);
  title.setText("Phoenix 3D — установка из одного APK");
  title.setTextSize(22);body.addView(title);
  TextView explanation=new TextView(this);
  explanation.setText("\nСохранены исходные инструменты строительства, каталог, стены, этажи и крыши. "+
   "Дополнительно доступны GLB-персонажи и игровые инструменты.\n\n"+
   "Весь комплект внутри этого APK; интернет не требуется. "+
   "Подтверждение установки запрашивает сам Android.\n\n"+
   "Внимание: новая подпись может не совпасть с подписью предыдущей установки. "+
   "Перед заменой сохрани свои проекты.\n");
  explanation.setTextSize(15);body.addView(explanation);
  install=new Button(this);
  install.setText("📦 Установить Phoenix 3D");body.addView(install);
  install.setOnClickListener(v->begin());
  Button open=new Button(this);open.setText("🎮 Открыть Phoenix 3D (после установки)");
  body.addView(open);open.setOnClickListener(v->{
   try{
    Intent intent=new Intent();
    intent.setClassName(TARGET,"com.phoenix3d.tools.PhoenixGameActivity");
    intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);startActivity(intent);
   }catch(Exception error){message("Игра ещё не установлена или Android запретил запуск: "+error.getMessage());}
  });
  info=new TextView(this);info.setTextSize(14);
  info.setText("Проверка встроенных строительных компонентов…");
  body.addView(info);
  setContentView(scroll);
  String msg=getIntent().getStringExtra(EXTRA_MESSAGE);
  if(msg!=null)message(msg);
 }
 @Override protected void onNewIntent(Intent intent){
  super.onNewIntent(intent);
  setIntent(intent);
  String result=intent.getStringExtra(EXTRA_MESSAGE);
  if(result!=null){
   busy=false;
   if(install!=null)install.setEnabled(true);
   message(result);
  }
 }
 private int px(int dp){return (int)(getResources().getDisplayMetrics().density*dp+.5f);}
 private void message(String text){if(info!=null)info.setText(text);}
 @Override protected void onResume(){
  super.onResume();
  if(!busy&&install!=null)install.setEnabled(true);
 }
 private void begin(){
  if(busy)return;
  if(Build.VERSION.SDK_INT>=26&&!getPackageManager().canRequestPackageInstalls()){
   try{
    message("Разреши этому установщику устанавливать приложения, затем вернись и нажми кнопку снова.");
    Intent setting=new Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES,
      Uri.parse("package:"+getPackageName()));
    startActivity(setting);
   }catch(Exception error){message("Не удалось открыть разрешения установки: "+error.getMessage());}
   return;
  }
  busy=true;install.setEnabled(false);message("Подготовка офлайн-компонентов…");
  new Thread(()->{
   PackageInstaller.Session session=null;
   try{
    // The 9 signed APK entries are verified by CI as assets/*.apk.
    // Reading our own installed APK as ZIP is more reliable than
    // AssetManager.open() for large, nonstandard .apk asset files.
    ZipFile container=new ZipFile(getApplicationInfo().sourceDir);
    try{
     long total=0;
     for(String name:SPLITS){
      ZipEntry entry=container.getEntry("assets/"+name);
      if(entry==null||entry.isDirectory()||entry.getSize()<10240)
       throw new IOException("Внутри APK нет компонента "+name+". Файлов не хватает.");
      total+=entry.getSize();
     }
    PackageInstaller installer=getPackageManager().getPackageInstaller();
    PackageInstaller.SessionParams params=
       new PackageInstaller.SessionParams(PackageInstaller.SessionParams.MODE_FULL_INSTALL);
    params.setAppPackageName(TARGET);
    params.setSize(total);
    int id=installer.createSession(params);
    session=installer.openSession(id);
    final long size=total;
    runOnUiThread(()->message("Передача девяти модулей в Android: "+(size/1048576)+" МиБ"));
    long written=0;
    for(int i=0;i<SPLITS.length;i++){
     String filename=SPLITS[i];
     ZipEntry entry=container.getEntry("assets/"+filename);
     try(InputStream src=container.getInputStream(entry);
         OutputStream dest=session.openWrite(filename,0,entry.getSize())){
      byte[] buffer=new byte[64*1024];
      int n;
      while((n=src.read(buffer))!=-1){dest.write(buffer,0,n);}
      session.fsync(dest);
     }
     final int progress=i+1;
     session.setStagingProgress((float)progress/SPLITS.length);
     runOnUiThread(()->message("Передано модулей: "+progress+" / 9. Не закрывай установщик."));
    }
    Intent result=new Intent(this,ResultReceiver.class);
    result.setAction("com.phoenix3d.installer.STATUS");
    result.putExtra("session",id);
    PendingIntent pending=PendingIntent.getBroadcast(this,id,result,
      PendingIntent.FLAG_UPDATE_CURRENT|PendingIntent.FLAG_MUTABLE);
    session.commit(pending.getIntentSender());
    session.close();session=null;
    runOnUiThread(()->message("Android проверяет полный Phoenix 3D. Подтверди системную установку."));
    }finally{container.close();}
   }catch(Exception error){
    if(session!=null){try{session.abandon();}catch(Exception ignored){}}
    runOnUiThread(()->{
     busy=false;install.setEnabled(true);
     message("Установка не подготовлена: "+error.getClass().getSimpleName()+": "+error.getMessage());
    });
   }
  },"PhoenixInstallSplits").start();
 }
 public static final class ResultReceiver extends BroadcastReceiver{
  @Override public void onReceive(Context context,Intent intent){
   int status=intent.getIntExtra(PackageInstaller.EXTRA_STATUS,PackageInstaller.STATUS_FAILURE);
   if(status==PackageInstaller.STATUS_PENDING_USER_ACTION){
    Intent confirm=intent.getParcelableExtra(Intent.EXTRA_INTENT);
    if(confirm!=null){
     confirm.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
     try{context.startActivity(confirm);}catch(Exception e){
      launchResult(context,"Android не открыл подтверждение установки: "+e.getMessage());
     }
    }else launchResult(context,"Android не передал экран подтверждения.");
   }else if(status==PackageInstaller.STATUS_SUCCESS){
    launchResult(context,"✅ Phoenix 3D установлен. Теперь можешь открыть игровой режим.");
   }else{
    String detail=intent.getStringExtra(PackageInstaller.EXTRA_STATUS_MESSAGE);
    launchResult(context,"Установка завершилась ошибкой ("+status+"): "+detail+
      "\nВозможно, установлена другая версия с несовместимой подписью. Сохрани проекты перед заменой.");
   }
  }
  private void launchResult(Context ctx,String info){
   Intent ui=new Intent(ctx,InstallerActivity.class);
   ui.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK|Intent.FLAG_ACTIVITY_CLEAR_TOP);
   ui.putExtra(EXTRA_MESSAGE,info);
   try{ctx.startActivity(ui);}catch(Exception ignored){}
  }
 }
}
