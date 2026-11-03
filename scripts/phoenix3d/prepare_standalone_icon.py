#!/usr/bin/env python3
"""Phoenix 3D icon generation.

Prefers the uploaded fireplace image from
android-phoenix-standalone/assets/fireplace.png if it exists in the repo.
Until that image is available in GitHub, draws a fireplace-themed icon.
No Planner logos/text/sign-in are included in standalone APK.
"""
from pathlib import Path
from PIL import Image,ImageDraw,ImageFilter
import argparse,math
a=argparse.ArgumentParser()
a.add_argument('--out',required=True)
a.add_argument('--image',default='android-phoenix-standalone/assets/fireplace.png')
q=a.parse_args()
out=Path(q.out);out.parent.mkdir(parents=True,exist_ok=True)
source=Path(q.image)
if source.is_file():
    im=Image.open(source).convert('RGBA')
    bbox=im.getbbox()
    if bbox:im=im.crop(bbox)
    side=max(im.size)
    canvas=Image.new('RGBA',(side,side),(0,0,0,0))
    canvas.alpha_composite(im,((side-im.width)//2,(side-im.height)//2))
    image=canvas.resize((512,512),Image.Resampling.LANCZOS)
    print('Exact supplied fireplace picture used:',source)
else:
    # Fallback icon: hand-drawn phoenix hearth motif. Intentionally do not
    # claim that this fallback is the exact uploaded image.
    n=512
    image=Image.new('RGBA',(n,n),(0,0,0,0))
    dr=ImageDraw.Draw(image)
    dr.rounded_rectangle((14,14,498,498),radius=90,fill=(20,24,35,255),outline=(207,152,71,255),width=11)
    dr.rounded_rectangle((26,26,486,486),radius=83,outline=(98,64,49,255),width=6)
    # Phoenix guild plaque above a stone mantelpiece
    dr.rounded_rectangle((78,132,435,186),radius=10,fill=(102,57,41),outline=(224,168,91),width=9)
    dr.rounded_rectangle((105,183,157,415),radius=9,fill=(135,105,93),outline=(209,171,119),width=7)
    dr.rounded_rectangle((358,183,411,415),radius=9,fill=(135,105,93),outline=(209,171,119),width=7)
    dr.rounded_rectangle((91,397,424,440),radius=8,fill=(135,93,74),outline=(223,170,99),width=6)
    dr.rounded_rectangle((153,184,360,407),radius=50,fill=(33,17,25),outline=(218,145,61),width=12)
    dr.rounded_rectangle((173,212,340,397),radius=35,fill=(66,27,16),outline=(115,67,43),width=7)
    dr.rounded_rectangle((173,317,341,406),radius=20,fill=(81,35,28))
    for x in range(180,342,50):
        dr.line((x,276,x,401),fill=(91,57,52),width=4)
    dr.line((169,304,345,304),fill=(107,66,42),width=4)
    # Stylized fire / ember with orange and gold tongues.
    dr.ellipse((194,332,324,414),fill=(229,74,20))
    dr.polygon([(200,383),(210,305),(235,339),(250,265),(270,324),(291,301),(304,381)],
               fill=(255,112,32))
    dr.polygon([(220,388),(237,333),(251,350),(268,305),(277,354),(294,383)],
               fill=(255,204,54))
    dr.polygon([(248,392),(260,343),(273,378),(263,393)],fill=(255,249,160))
    dr.line((197,405,320,405),fill=(255,177,58),width=5)
    # Phoenix crest
    dr.polygon([(256,89),(287,107),(273,129),(256,147),(239,129),(225,107)],fill=(244,173,57))
    dr.line((237,114,278,113),fill=(255,227,111),width=7)
    image=image.filter(ImageFilter.UnsharpMask(radius=1.2,percent=120))
    print('WARNING: exact uploaded fireplace PNG not available on GitHub. Generated fireplace-themed fallback.')
image.save(out,'PNG',optimize=True)
print('Icon saved:',out,'bytes=',out.stat().st_size)
