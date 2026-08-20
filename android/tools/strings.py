#!/usr/bin/env python3
"""
Сборка строк Android из каталога iOS.

    python3 android/tools/strings.py

Источник строк один на все клиенты — `ios/Tetr/Localizable.xcstrings`.
Переписывать их руками нельзя: клиенты разойдутся на первой же правке, и
разойдутся молча — армянская фраза на экране Android выглядит одинаково
правильно и когда она свежая, и когда отстала на месяц.

Ключи переводятся точка в двойное подчёркивание (`auth.phone` →
`auth__phone`): у Android в имени ресурса точки быть не может, а
совпадение буква в букву позволяет искать один и тот же ключ во всех трёх
клиентах одним запросом.

Скрипт лежит в репозитории, а не живёт разово в чьей-то сессии: словарь
правится каждую неделю, и пересборка обязана быть одной командой.
"""
import json
import os
import re
import sys
from xml.sax.saxutils import escape

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
SRC = os.path.join(ROOT, 'ios', 'Tetr', 'Localizable.xcstrings')
RES = os.path.join(ROOT, 'android', 'app', 'src', 'main', 'res')

# Куда какой язык. Армянский — основной, он лежит в values без суффикса:
# это язык продукта, и он же запасной для всего, чего нет в переводе.
FOLDERS = {'hy': 'values', 'ru': 'values-ru', 'en': 'values-en'}

HEAD = ('<?xml version="1.0" encoding="utf-8"?>\n'
        '<!-- Сгенерировано из ios/Tetr/Localizable.xcstrings скриптом\n'
        '     android/tools/strings.py. Не править руками: источник строк\n'
        '     один на все клиенты, иначе они разойдутся. -->\n'
        '<resources>\n')

# Соответствие количеств. У iOS их шесть, у Android те же шесть имён —
# но `zero`/`two` в наших языках не встречаются, и пустых веток не пишем.
QUANTITY = {'zero': 'zero', 'one': 'one', 'two': 'two',
            'few': 'few', 'many': 'many', 'other': 'other'}


def to_android(text: str) -> str:
    """Строка iOS в строку Android."""
    # Подстановки: у Apple `%@` для строк и `%lld` для чисел, у Android
    # `%s` и `%d`. Позиционные (`%1$@`) переводятся так же, с сохранением
    # номера: в армянском и русском порядок слов разный, и без номеров
    # перевод пришлось бы подгонять под порядок исходника.
    text = re.sub(r'%(\d+\$)?@', lambda m: '%' + (m.group(1) or '') + 's', text)
    text = re.sub(r'%(\d+\$)?(?:lld|ld|d|i)', lambda m: '%' + (m.group(1) or '') + 'd', text)

    text = escape(text)
    # Апостроф и кавычка в Android экранируются, иначе ресурс не собирается.
    text = text.replace("'", "\\'").replace('"', '\\"')
    # Перенос строки внутри значения Android понимает только как \n.
    text = text.replace('\n', '\\n')
    return text


# Имя ресурса Android: буквы, цифры и подчёркивание, начинается с буквы.
NAME_OK = re.compile(r'^[a-z][A-Za-z0-9_]*$')


def is_product_key(key: str) -> bool:
    """Ключ продукта или литерал, подобранный SwiftUI сам?

    Каталог Apple собирается компилятором, и в него попадает КАЖДЫЙ
    строковый литерал вида `Text("...")` — включая склейки `%@ · %@`,
    разделители, «TETRIN» и число «365» из вёрстки. Для iOS это безвредно:
    ключ и есть текст, перевода у него нет, показывается он сам.

    Android так не умеет. Имя ресурса у него — идентификатор, и `%@ %@`
    или `365` именем быть не могут: сборка либо падает, либо молча заводит
    ресурс, которым никто не пользуется. Поэтому берём только ключи
    продукта — те, что названы через точку (`auth.phone`), как их и
    заводят руками.
    """
    return '.' in key and NAME_OK.match(key.replace('.', '_')) is not None


def value_for(entry: dict, lang: str):
    """Перевод на язык, либо None если его нет."""
    loc = entry.get('localizations', {}).get(lang)
    if not loc:
        return None
    if 'stringUnit' in loc:
        return loc['stringUnit'].get('value')
    # Множественное число: у Apple оно спрятано под именем подстановки.
    if 'variations' in loc:
        plural = loc['variations'].get('plural')
        if plural:
            return {QUANTITY[k]: v['stringUnit']['value']
                    for k, v in plural.items() if k in QUANTITY}
        # Вариации по устройству нам не нужны: берём общий случай.
        device = loc['variations'].get('device')
        if device:
            for k in ('other', 'iphone'):
                if k in device:
                    return device[k]['stringUnit'].get('value')
    return None


def main() -> int:
    with open(SRC, encoding='utf-8') as f:
        catalog = json.load(f)

    strings = catalog['strings']
    source = catalog.get('sourceLanguage', 'hy')
    written = {}

    for lang, folder in FOLDERS.items():
        plain, plural = [], []

        for key in sorted(strings):
            if not is_product_key(key):
                continue
            entry = strings[key]
            value = value_for(entry, lang)

            # Своего перевода нет — для основного языка берём сам ключ как
            # текст (так устроен каталог Apple: исходная строка и есть
            # ключ), для остальных не пишем ничего: Android сам возьмёт
            # запасной язык, и это честнее, чем показать армянское слово
            # посреди русского экрана.
            # Перевода нет — не пишем ничего: Android возьмёт запасной
            # язык сам. Это честнее, чем показать ключ или армянское слово
            # посреди русского экрана.
            if value is None:
                continue

            name = key.replace('.', '__')
            if isinstance(value, dict):
                items = ''.join(
                    f'        <item quantity="{q}">{to_android(v)}</item>\n'
                    for q, v in sorted(value.items()))
                plural.append(f'    <plurals name="{name}">\n{items}    </plurals>\n')
            else:
                plain.append(f'    <string name="{name}">{to_android(value)}</string>\n')

        path = os.path.join(RES, folder, 'strings.xml')
        os.makedirs(os.path.dirname(path), exist_ok=True)
        with open(path, 'w', encoding='utf-8') as f:
            f.write(HEAD)
            f.writelines(plain)
            f.writelines(plural)
            f.write('</resources>\n')

        written[lang] = (len(plain), len(plural))

    for lang, (a, b) in written.items():
        print(f'{FOLDERS[lang]}: строк {a}, с множественным числом {b}')
    return 0


if __name__ == '__main__':
    sys.exit(main())
