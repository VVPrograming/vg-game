import shutil
from PIL import Image
src=Image.open('play/icon-512.png').convert('RGBA')
res='android/app/src/main/res'
for d,sz in {'mdpi':48,'hdpi':72,'xhdpi':96,'xxhdpi':144,'xxxhdpi':192}.items():
    im=src.resize((sz,sz),Image.LANCZOS)
    for n in ('ic_launcher','ic_launcher_round','ic_launcher_foreground'):
        im.save(f'{res}/mipmap-{d}/{n}.png')
shutil.rmtree(f'{res}/mipmap-anydpi-v26',ignore_errors=True)
