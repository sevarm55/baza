# App Review notes

Текст ниже вставляется в поле «Notes» в App Store Connect как есть, без
заголовка. Порядок строк не переставлять: инструкция по входу стоит
первой намеренно.

Правило одной двери: в заметке ровно один аккаунт и ровно один способ
войти. Прошлый отказ 1.1 по Guideline 2.1 случился потому, что на экране
входа было два пути, и проверяющий пошёл не по тому. Ни телефон, ни PIN,
ни код из SMS здесь не упоминаются: упоминание это приглашение
попробовать.

Строка про прежние данные нужна с версии 1.3. Заметки прошлых отправок
остаются у Apple в истории, и там лежит вход, которого в продукте больше
нет. Строка закрывает этот путь, не называя его.

Пароль в этот файл не пишется. Он живёт в самом поле App Store Connect и
в базе продукта, и меняется без правки репозитория.

Пути в разделе про удаление совпадают с подписями на английском
интерфейсе дословно. Проверяющий ищет их глазами, и «Profile and
sign-in» вместо «Profile and access» это тупик на ровном месте.

---

HOW TO SIGN IN

Sign in with the email and password below. This is the only way to sign
in; the app has no other sign-in method.

    Email:    demo@tetrin.pro
    Password: <вставить пароль из App Store Connect>

Sign-in changed in this version. Credentials from any earlier submission
no longer work, so please use the two lines above.

The demo account is an owner account with a fully populated car wash, so
every screen has real data: shift, summary, payroll, clients, services,
expenses and reports.

The app opens in Armenian. English and Russian are behind the globe
button on the sign-in screen, and the choice is remembered. The first
launch shows a four screen intro with a Skip button.

WHAT THE APP DOES

Tetrin is bookkeeping for a car wash. The owner sees revenue, payroll and
net profit for any period; a washer records each car from their phone in
three taps. Everything the app shows belongs to one business and is
visible only to the people that business employs.

ACCOUNT DELETION

Account deletion is inside the app: More → Profile and access → Delete
the business. It asks for the account password and removes the business,
its staff and all records permanently.
