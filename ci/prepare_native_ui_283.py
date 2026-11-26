#!/usr/bin/env python3
"""Prepare 2.1.83 from the exact 2.1.82 binary, never the old Gradle app."""
import re, sys, zipfile, struct, hashlib
from pathlib import Path
BASE_HASH="4d051c76d1255fb0b9a08b7dd15aba371b255855b2621b2ea33b94acb0ba5306"
PATCH_HASH="7cfc5d1414b774e19c58c8c9c53fb07378cd12ed8b759919632c03091bc72ba4"
ROOT=Path(sys.argv[2])
P="Lcom/phoenix/worldbuilder/MainActivity;"
U="Lcom/phoenix/worldbuilder/UiRuntime;"
def check(path, sha):
    if hashlib.sha256(path.read_bytes()).hexdigest()!=sha:
        raise RuntimeError("Unexpected input checksum: "+str(path))
def prepare():
    check(ROOT/"base.apk", BASE_HASH)
    check(ROOT/"draft.zip", PATCH_HASH)
    with zipfile.ZipFile(ROOT/"draft.zip") as z:
        for name in ("native/com/phoenix/worldbuilder/UiRuntime.java", "assets/engine/builder/phoenix-ui-studio.js"):
            target=ROOT/name
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_bytes(z.read(name))
def patch_smali():
    folder=ROOT/"decoded/smali/com/phoenix/worldbuilder"
    act=folder/"MainActivity.smali"
    bridge=folder/"MainActivity$ExportBridge.smali"
    a=act.read_text()
    b=bridge.read_text()
    assert ".field private webView:Landroid/webkit/WebView;" in a
    assert "UiRuntime;" not in a+b
    marker=".field private webView:Landroid/webkit/WebView;"
    a=a.replace(marker,marker+"\n.field private uiRuntime:"+U,1)
    a+=f"""
.method final getUiRuntime(){U}
    .locals 2
    iget-object v0, p0, {P}->uiRuntime:{U}
    if-nez v0, :done
    iget-object v1, p0, {P}->webView:Landroid/webkit/WebView;
    if-eqz v1, :done
    new-instance v0, {U}
    invoke-direct {{v0, p0, v1}}, {U}-><init>(Landroid/app/Activity;Landroid/webkit/WebView;)V
    iput-object v0, p0, {P}->uiRuntime:{U}
    :done
    return-object v0
.end method

.method private releaseUiRuntime()V
    .locals 1
    iget-object v0, p0, {P}->uiRuntime:{U}
    if-eqz v0, :done
    invoke-virtual {{v0}}, {U}->destroy()V
    const/4 v0, 0x0
    iput-object v0, p0, {P}->uiRuntime:{U}
    :done
    return-void
.end method
"""
    pattern=r"(?m)(^\.method[^\n]* onDestroy\(\)V\n\s*\.(?:locals|registers) \d+\n)"
    a,n=re.subn(pattern,lambda m:m.group(1)+f"    invoke-direct {{p0}}, {P}->releaseUiRuntime()V\n",a)
    assert n==1,"onDestroy layout changed"
    B="Lcom/phoenix/worldbuilder/MainActivity$ExportBridge;"
    assert "this$0:"+P in b
    b+=f"""
.method public openUiRuntime(Ljava/lang/String;)Z
    .locals 1
    .annotation runtime Landroid/webkit/JavascriptInterface;
    .end annotation
    iget-object v0, p0, {B}->this$0:{P}
    invoke-virtual {{v0}}, {P}->getUiRuntime(){U}
    move-result-object v0
    if-eqz v0, :blocked
    invoke-virtual {{v0, p1}}, {U}->open(Ljava/lang/String;)Z
    move-result v0
    return v0
    :blocked
    const/4 v0, 0x0
    return v0
.end method

.method public closeUiRuntime(Ljava/lang/String;)V
    .locals 1
    .annotation runtime Landroid/webkit/JavascriptInterface;
    .end annotation
    iget-object v0, p0, {B}->this$0:{P}
    invoke-virtual {{v0}}, {P}->getUiRuntime(){U}
    move-result-object v0
    if-eqz v0, :done
    invoke-virtual {{v0, p1}}, {U}->close(Ljava/lang/String;)V
    :done
    return-void
.end method
"""
    act.write_text(a); bridge.write_text(b)
def package():
    base=ROOT/"base.apk"
    output=ROOT/"candidate-unaligned.apk"
    version_path="assets/engine/runtime/phoenix-version.js"
    ui="assets/engine/builder/phoenix-ui-studio.js"
    changed={"AndroidManifest.xml","classes.dex",version_path,ui}
    with zipfile.ZipFile(base) as z, zipfile.ZipFile(ROOT/"rebuilt.apk") as rebuilt, zipfile.ZipFile(output,"w",allowZip64=False) as out:
        assert "classes2.dex" not in z.namelist()
        assert not any(n.startswith("META-INF/") and n.upper().endswith((".RSA",".DSA",".EC",".SF")) for n in z.namelist())
        for info in z.infolist():
            name=info.filename
            data=z.read(name)
            if name=="AndroidManifest.xml":
                old="2.1.82".encode("utf-16le")
                assert data.count(old)==1 and struct.unpack_from("<I",data,1720)[0]==112
                data=bytearray(data.replace(old,"2.1.83".encode("utf-16le")))
                struct.pack_into("<I",data,1720,113)
            elif name=="classes.dex":
                data=rebuilt.read(name)
            elif name==ui:
                data=(ROOT/ui).read_bytes()
            elif name==version_path:
                assert b"2.1.82" in data and b"code=112" in data
                data=data.replace(b"2.1.82",b"2.1.83").replace(b"code=112",b"code=113").replace(b"UI JavaScript Runtime Preview",b"UI Native WebView")
            out.writestr(info,data)
        out.write(ROOT/"native-dex/classes.dex","classes2.dex",compress_type=zipfile.ZIP_DEFLATED)
    with zipfile.ZipFile(base) as z,zipfile.ZipFile(output) as out:
        assert out.testzip() is None
        assert set(out.namelist())==set(z.namelist())|{"classes2.dex"}
        actual={n for n in z.namelist() if (z.getinfo(n).CRC,z.getinfo(n).file_size)!=(out.getinfo(n).CRC,out.getinfo(n).file_size)}
        assert actual==changed,actual
    print("APK payload: only four existing entries changed, plus classes2.dex")
if __name__=="__main__":
    {"prepare":prepare,"patch-smali":patch_smali,"package":package}[sys.argv[1]]()
