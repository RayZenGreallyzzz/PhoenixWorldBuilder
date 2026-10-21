const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const root=path.join(__dirname,'../app/src/main');
const file=p=>fs.readFileSync(path.join(root,p));
const text=p=>file(p).toString('utf8');
function image(filePath){
 const b=file(filePath);
 assert.equal(b.toString('ascii',0,4),'RIFF','Image must be WebP '+filePath);
 assert.equal(b.toString('ascii',8,12),'WEBP','Valid WebP magic '+filePath);
 assert(b.length>2500&&b.length<900000,'Launcher art should remain lightweight '+filePath);
 return b.length;
}
const icon=image('res/mipmap-nodpi/ic_launcher.webp');
const foreground=image('res/drawable-nodpi/ic_launcher_foreground.webp');
const splash=image('res/drawable-nodpi/phoenix_splash.webp');
const xml=text('AndroidManifest.xml');
const java=text('java/com/phoenix/worldbuilder/MainActivity.java');
const adaptive=text('res/mipmap-anydpi-v26/ic_launcher.xml');
assert(xml.includes('android:icon="@mipmap/ic_launcher"'),'Launcher icon must be assigned');
assert(xml.includes('android:theme="@style/PhoenixTheme"'),'Custom launch theme must be assigned');
assert(adaptive.includes('@drawable/ic_launcher_foreground'),'Adaptive icon must use new foreground');
assert(text('res/values-v31/styles.xml').includes('android:windowSplashScreenAnimatedIcon'),'Android 12+ launch splash must be configured');
assert(java.includes('R.drawable.phoenix_splash'),'App must display the actual illustrated splash');
assert(java.includes('ImageView.ScaleType.FIT_CENTER'),'Never crop the title on landscape tablets');
assert(java.includes('onPageFinished(')&&java.includes('removeView(shownSplash)'),'Release the overlay after the editor has loaded');
assert(!java.includes('Thread.sleep('),'Loading cannot stall on a sleep');
console.log('Phoenix Builder Android branding OK. Assets:',{icon,foreground,splash});
