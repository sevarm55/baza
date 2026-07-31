"""
Скриншоты для App Store.

Композиция взята с генерации nano-banana-pro — она попала точно: грейповый
градиент, лаймовое свечение за телефоном, заголовок сверху. Но саму
картинку взять нельзя по двум причинам: модель отдаёт 768×1360, а App Store
требует ровно 1320×2868, и при перерисовке она портит армянский —
«08:00-ից» превратилось в «08:00-hg».

Поэтому та же композиция собирается в HTML вокруг НАСТОЯЩЕГО снимка
экрана, а Chrome рендерит её в точный размер. Текст остаётся живым.
"""
import base64
import pathlib
import subprocess

HERE = pathlib.Path(__file__).parent
SHOTS = HERE
OUT = HERE
FONTS = HERE.parent.parent / "app" / "fonts"

W, H = 1320, 2868
CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"

SCREENS = [
    ("s1-today.png", "Ամբողջ օրը՝<br>մեկ էկրանին",
     "Հասույթ, շահույթ, ով է հերթափոխին"),
    # Экран выбора услуги был бы честнее по смыслу — это главное действие,
    # — но у него нижняя половина пустая, и в витрине это читается как
    # незаконченный продукт. Клиенты плотные и говорят о том же: записи
    # копятся сами.
    ("s5-clients.png", "Ամեն մեքենան<br>հիշվում է",
     "Քանի անգամ է եղել, որքան է թողել"),
    ("s3-calendar.png", "Ամիսը՝<br>մեկ հայացքով",
     "Որ օրն էր խիտ, որը՝ դատարկ"),
    ("s4-day.png", "Ո՞վ ինչ<br>լվաց",
     "Հերթափոխ, հանձնված կանխիկ, ամեն գրանցում"),
]


def b64(path: pathlib.Path, mime: str) -> str:
    return f"data:{mime};base64," + base64.b64encode(path.read_bytes()).decode()


def page(shot: str, title: str, sub: str) -> str:
    return f"""<!doctype html><html><head><meta charset="utf-8"><style>
@font-face {{ font-family: M; src: url({b64(FONTS / 'Mardoto-Bold.woff2', 'font/woff2')}); font-weight: 700 }}
@font-face {{ font-family: M; src: url({b64(FONTS / 'Mardoto-Regular.woff2', 'font/woff2')}); font-weight: 400 }}
* {{ margin: 0; padding: 0; box-sizing: border-box }}
body {{
  width: {W}px; height: {H}px; overflow: hidden;
  font-family: M, sans-serif;
  /* грейп сверху вниз — фон марки, тот же, что на экране входа */
  background: linear-gradient(165deg, #3B1782 0%, #2E1065 45%, #1E0A47 100%);
  position: relative;
}}
/* Лаймовое свечение: единственное яркое пятно, ровно как лайм в самом
   продукте достаётся только действию.

   Сидит НАД телефоном, а не за ним. За ним его не видно вовсе — корпус
   непрозрачный и шире свечения; первая версия светила исключительно в
   те 130 пикселей по краям, где градиент уже погас. */
.glow {{
  position: absolute; left: 50%; top: 32%;
  width: 1240px; height: 760px; transform: translate(-50%, -50%);
  background: radial-gradient(ellipse, rgba(215,255,0,.34) 0%, rgba(215,255,0,.12) 42%, transparent 70%);
  /* screen, а не обычное наложение: полупрозрачный лайм поверх тёмного
     фиолета даёт грязную оливу, а не свет. Свет складывается. */
  mix-blend-mode: screen;
  filter: blur(60px);
}}
.head {{ position: absolute; top: 120px; left: 0; right: 0; text-align: center; z-index: 2 }}
.head h1 {{
  font-size: 108px; font-weight: 700; line-height: 1.08;
  color: #fff; letter-spacing: -.02em;
}}
.head p {{ margin-top: 30px; font-size: 40px; color: rgba(255,255,255,.62) }}
/* Корпус телефона. Рисуется, а не берётся картинкой: нарисованный
   совпадает с реальными пропорциями снимка до пикселя. */
.phone {{
  position: absolute; left: 50%; bottom: -190px; transform: translateX(-50%);
  width: 1060px; padding: 17px;
  background: linear-gradient(150deg, #6b6b73, #2a2a2f 40%, #47474e);
  border-radius: 114px;
  box-shadow: 0 60px 120px rgba(0,0,0,.55);
  z-index: 1;
}}
.phone .screen {{
  border-radius: 97px; overflow: hidden; background: #FAF9FC;
  display: block; width: 100%;
}}
.phone img {{ display: block; width: 100%; }}
</style></head><body>
<div class="glow"></div>
<div class="head"><h1>{title}</h1><p>{sub}</p></div>
<div class="phone"><div class="screen"><img src="{b64(SHOTS / shot, 'image/png')}"></div></div>
</body></html>"""


def main() -> None:
    OUT.mkdir(exist_ok=True)
    for i, (shot, title, sub) in enumerate(SCREENS, 1):
        html = OUT / f"{i}.html"
        html.write_text(page(shot, title, sub))
        png = OUT / f"appstore-{i}.png"
        subprocess.run(
            [CHROME, "--headless", "--disable-gpu", "--hide-scrollbars",
             f"--screenshot={png}", f"--window-size={W},{H}", str(html)],
            check=True, capture_output=True,
        )
        print(f"{png.name}")


main()
