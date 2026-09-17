# Установка сайта + сервера Minecraft с плагином на один VDS

> Гайд для чистого VDS (Ubuntu 22.04 / 24.04, Debian 11/12 — всё под root).
> Рекомендуется VDS с **4–6 GB RAM и больше** (Docker-стек ~1.5 GB + Minecraft 2–3 GB).
>
> Репозитории:
> - Сайт: `https://github.com/propalvlimbo-dev/w0-rjitb09.git` (frontend / backend / admin)
> - Плагин: `https://github.com/propalvlimbo-dev/4w5h4w5h.git` (готовый jar уже в репозитории)

## Как это будет работать (схема)

```
Интернет
   │
   ├─ :80/443  elytrix.pw ──────► Nginx ─┬─ /  ──────────────► Frontend Next.js :3000 (pm2)
   │                                     └─ /safdjuhos8dfuahj ► Admin Next.js   :3001 (pm2)
   │                                            │ Next.js пробрасывает /api на backend
   │                                            ▼
   │                                 Backend (Go, Docker) :8080 (только 127.0.0.1)
   │                                   ├─ PostgreSQL :5432 (Docker, 127.0.0.1)
   │                                   ├─ Redis      :6379 (Docker, 127.0.0.1)
   │                                   ├─ MySQL      :3306 (Docker, 127.0.0.1) ── база плагина
   │                                   └─ ► http://host.docker.internal:20559 ──┐
   │                                                                             ▼
   └─ :25565  mc.elytrix.pw ───► Minecraft Purpur 1.16.5 (systemd)
                                 └─ плагин ElytrixSite: HTTP API :20559, MySQL 127.0.0.1:3306
```

## Главные отличия от старой схемы (сайт на одном VPS, сервер на play2go)

1. **`PLUGIN_URL` больше не `http://c6.play2go.cloud:20559`** → теперь `http://host.docker.internal:20559` (backend в Docker стучится на этот же сервер).
2. **MySQL плагина больше не на play2go** → поднимаем MySQL в том же docker-compose, плагин ходит на `127.0.0.1:3306`.
3. **`ip-whitelist` в конфиге плагина очищаем** (backend приходит из docker-сети, IP там плавающий). Защиту несут: firewall (порт 20559 закрыт извне) + HMAC-подпись (secret тот же).
4. **Minecraft теперь на самом VDS под systemd** (автозапуск + автоперезапуск при падении).
5. Java 17 требует флагов `-DPaper.IgnoreJavaVersion=true -DPurpur.IgnoreJavaVersion=true` для 1.16.5 — они уже вписаны в юнит ниже.
6. **Нигде ничего не привязываем к 0.0.0.0 руками.** Наружу и так смотрят только Nginx (80/443) и Minecraft (25565) — они по умолчанию слушают все интерфейсы. А вот базы (PostgreSQL 5432, MySQL 3306, Redis 6379) и backend (8080) обязаны слушать только 127.0.0.1: если их выпустить на 0.0.0.0, они окажутся в интернете, и боты, сканирующие порты, найдут их по паролям (они уже засветились в переписке) и утащат/зашифруют данные. `127.0.0.1` = «только с этого же сервера» — именно это и нужно.

---

## Шаг 1. Подготовка сервера

```bash
apt update && apt upgrade -y
apt install -y curl wget git nano ufw nginx
```

Если у VDS мало RAM (2–4 GB), добавьте swap (иначе сборка Next.js может упасть):

```bash
fallocate -l 2G /swapfile && chmod 600 /swapfile && mkswap /swapfile && swapon /swapfile
echo '/swapfile none swap sw 0 0' >> /etc/fstab
```

## Шаг 2. Docker

```bash
curl -fsSL https://get.docker.com | sh
docker --version && docker compose version
```

## Шаг 3. Node.js 20 + pm2

```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt install -y nodejs
npm install -g pm2
node -v && pm2 -v
```

## Шаг 4. Java 17 (для Purpur 1.16.5)

```bash
apt install -y openjdk-17-jre-headless
java -version
```

## Шаг 5. Загрузка кода (пути как на старом сервере)

```bash
# Сайт — сразу в /root/site (папка должна быть ПУСТОЙ)
git clone https://github.com/propalvlimbo-dev/w0-rjitb09.git /root/site

# Плагин (готовый jar лежит прямо в репозитории, собирать Maven не нужно)
git clone https://github.com/propalvlimbo-dev/4w5h4w5h.git /root/plugin-src
mkdir -p /root/minecraft/plugins
cp /root/plugin-src/target/ElytrixSite.jar /root/minecraft/plugins/
```

## Шаг 6. docker-compose для backend (+ PostgreSQL + Redis + MySQL плагина)

Все секреты уже вписаны (те же, что были). **Замените 4 строки `ANYPAY_...` на свои значения** — они есть на старом VPS в файле `/root/elytrix/backend/.env` (посмотреть на СТАРОМ сервере: `cat /root/elytrix/backend/.env`).

```bash
cat > /root/site/backend/docker-compose.yml <<'EOF'
services:
  postgres:
    image: postgres:16-alpine
    restart: always
    environment:
      POSTGRES_DB: elytrix
      POSTGRES_USER: elytrix
      POSTGRES_PASSWORD: eadae97129b135757b79bc649817beb4
    volumes:
      - pgdata:/var/lib/postgresql/data
    ports:
      - "127.0.0.1:5432:5432"

  redis:
    image: redis:7-alpine
    restart: always
    command: redis-server --requirepass 52a245b102b56f2f550c1362efbbc845
    ports:
      - "127.0.0.1:6379:6379"

  mysql:
    image: mysql:8.0
    restart: always
    environment:
      MYSQL_ROOT_PASSWORD: f8a1c93e52b74d6ab0e39c47d51e8f22
      MYSQL_DATABASE: s29470_elytrix
      MYSQL_USER: u29470_iHvxVAwYg8
      MYSQL_PASSWORD: "8==5FI.lN7lQxweIONORr@.C"
    volumes:
      - mysqldata:/var/lib/mysql
    ports:
      - "127.0.0.1:3306:3306"

  backend:
    build: .
    restart: always
    environment:
      ANYPAY_MERCHANT_ID: ВСТАВЬ_СВОЙ_MERCHANT_ID
      ANYPAY_PROJECT_SECRET: ВСТАВЬ_СВОЙ_PROJECT_SECRET
      ANYPAY_API_ID: ВСТАВЬ_СВОЙ_API_ID
      ANYPAY_API_KEY: ВСТАВЬ_СВОЙ_API_KEY
      SITE_URL: http://elytrix.pw
      DB_DSN: postgres://elytrix:eadae97129b135757b79bc649817beb4@postgres:5432/elytrix?sslmode=disable
      REDIS_ADDR: redis:6379
      REDIS_PASS: 52a245b102b56f2f550c1362efbbc845
      ADMIN_PASSWORD_HASH: "$$2a$$12$$pn2ijau2MjsaS/oMEd7YQOiVqE5wcBp06iyOzaY7JsJRTHyYOnYPq"
      ADMIN_PATH: /safdjuhos8dfuahj
      JWT_SECRET: '913cc77f27f9a5e5c51247d40efaadff683573baf22ef6f9a21e9592444bfd1d'
      PLUGIN_URL: http://host.docker.internal:20559
      PLUGIN_SECRET: '35a4b5fac4473d4e0228e37a8eeec12e5c5ccdb66da8ddc1e121caad195a37f9'
      PORT: 8080
    ports:
      - "127.0.0.1:8080:8080"
    depends_on:
      - postgres
      - redis
      - mysql
    extra_hosts:
      - "host.docker.internal:host-gateway"

volumes:
  pgdata:
  mysqldata:
EOF
```

## Шаг 7. Запуск backend + баз

```bash
cd /root/site/backend
docker compose up -d --build
```

Первый старт занимает 1–3 минуты (сборка образа + инициализация MySQL). Проверка:

```bash
docker compose ps                          # все 4 контейнера должны быть Up
curl http://127.0.0.1:8080/api/products    # должен вернуть [] или список товаров
curl http://127.0.0.1:8080/api/categories
```

Таблицы в PostgreSQL создаются автоматически при старте backend.

## Шаг 8. Frontend и Admin (pm2)

```bash
# Frontend
cd /root/site/frontend
echo 'API_URL=http://127.0.0.1:8080' > .env.production
npm ci
npm run build
pm2 start "npm run start" --name frontend

# Admin
cd /root/site/admin
echo 'API_URL=http://127.0.0.1:8080' > .env.production
npm ci
npm run build
pm2 start "npm run start" --name admin

# Автозапуск pm2 при перезагрузке VDS
pm2 startup systemd -u root --hp /root   # выполнить команду, которую он подсказал, если попросит
pm2 save
```

Проверка:

```bash
curl -I http://127.0.0.1:3000   # frontend
curl -I http://127.0.0.1:3001/safdjuhos8dfuahj   # admin
```

## Шаг 9. Nginx

```bash
cat > /etc/nginx/sites-available/elytrix <<'EOF'
server {
    listen 80;
    listen [::]:80;
    server_name elytrix.pw www.elytrix.pw;

    client_max_body_size 10m;

    # --- Админка ---
    # Страница логина и страницы /dashboard/* — Next.js админки (порт 3001)
    location = /safdjuhos8dfuahj {
        proxy_pass http://127.0.0.1:3001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
    location = /safdjuhos8dfuahj/ { return 301 /safdjuhos8dfuahj; }

    location /safdjuhos8dfuahj/dashboard {
        proxy_pass http://127.0.0.1:3001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    # Статика админки
    location /safdjuhos8dfuahj/_next/ {
        proxy_pass http://127.0.0.1:3001;
        proxy_set_header Host $host;
    }

    # Всё остальное под /safdjuhos8dfuahj/* — это API админки (backend, порт 8080):
    # /login, /logout, /stats, /products, /orders, /settings, /promos, /plugin-status, /logs ...
    location /safdjuhos8dfuahj/ {
        proxy_pass http://127.0.0.1:8080;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    # --- Главный сайт (frontend, порт 3000). /api/* он сам пробрасывает на backend ---
    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
EOF

ln -sf /etc/nginx/sites-available/elytrix /etc/nginx/sites-enabled/elytrix
rm -f /etc/nginx/sites-enabled/default
nginx -t && systemctl reload nginx
systemctl enable nginx
```

## Шаг 10. Minecraft-сервер (Purpur 1.16.5)

```bash
mkdir -p /root/minecraft && cd /root/minecraft

# Скачать Purpur 1.16.5
wget -O purpur-1.16.5.jar https://api.purpurmc.org/v2/purpur/1.16.5/latest/download

# Согласиться с EULA
echo 'eula=true' > eula.txt
```

Конфиг плагина (**важно положить до первого запуска** — тогда плагин не перезапишет его):

```bash
cat > /root/minecraft/plugins/ElytrixSite/config.yml <<'EOF'
mysql:
  host: 127.0.0.1
  port: 3306
  database: s29470_elytrix
  user: u29470_iHvxVAwYg8
  password: "8==5FI.lN7lQxweIONORr@.C"

api:
  port: 20559
  secret: 35a4b5fac4473d4e0228e37a8eeec12e5c5ccdb66da8ddc1e121caad195a37f9
  ip-whitelist: []
EOF
```

systemd-сервис (автозапуск при загрузке + автоперезапуск при падении).
Память под Java по размеру VDS (сайт-стек на этом же сервере ест ~1,5–2 ГБ, его вычитаем):
- **4 GB VDS** → `-Xms2G -Xmx2G`
- **6 GB VDS** → `-Xms3G -Xmx3G`
- **8 GB VDS** → `-Xms4G -Xmx4G` (макс 5G)
- **12 GB VDS** → `-Xms8G -Xmx8G` (макс 9G — больше нельзя, иначе не влезет сайт + ОС)
- **16 GB VDS** (сайт на отдельной машине) → можно 10–12G

```bash
cat > /etc/systemd/system/minecraft.service <<'EOF'
[Unit]
Description=Minecraft Purpur 1.16.5 (Elytrix)
After=network-online.target docker.service
Wants=network-online.target

[Service]
Type=simple
WorkingDirectory=/root/minecraft
ExecStart=/usr/bin/java -Xms3G -Xmx3G \
  -DPaper.IgnoreJavaVersion=true -DPurpur.IgnoreJavaVersion=true \
  -XX:+UseG1GC -XX:+ParallelRefProcEnabled -XX:MaxGCPauseMillis=200 \
  -XX:+UnlockExperimentalVMOptions -XX:+DisableExplicitGC -XX:+AlwaysPreTouch \
  -XX:G1NewSizePercent=30 -XX:G1MaxNewSizePercent=40 -XX:G1HeapRegionSize=8M \
  -XX:G1ReservePercent=20 -XX:G1HeapWastePercent=5 -XX:G1MixedGCCountTarget=4 \
  -XX:InitiatingHeapOccupancyPercent=15 -XX:G1MixedGCLiveThresholdPercent=90 \
  -XX:G1RSetUpdatingPauseTimePercent=5 -XX:SurvivorRatio=32 \
  -XX:+PerfDisableSharedMem -XX:MaxTenuringThreshold=1 \
  -Dusing.aikars.flags=https://mcflags.emc.gs -Daikars.new.flags=true \
  -jar purpur-1.16.5.jar nogui
Restart=always
RestartSec=10
TimeoutStopSec=60

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable --now minecraft
```

Смотреть запуск/логи сервера:

```bash
journalctl -u minecraft -f      # выйти — Ctrl+C
```

Дождитесь строки `Done (...)! For help, type "help"` — сервер запущен. Плагин в логах должен написать:

```
[ElytrixSite] MySQL connected
[ElytrixSite] API started on port 20559
```

## Шаг 11. Firewall

```bash
ufw allow OpenSSH          # если SSH на нестандартном порту — замените, см. ss -tlnp | grep ssh
ufw allow 80/tcp           # сайт
ufw allow 443/tcp          # https (на будущее)
ufw allow 25565/tcp        # Minecraft
ufw allow 25565/udp
ufw allow from 172.16.0.0/12 to any port 20559 proto tcp   # backend(Docker) -> плагин
ufw --force enable
ufw status
```

Порты 5432/6379/3306/8080 наружу не торчат — они привязаны к 127.0.0.1.

## Шаг 12. DNS

В панели управления доменом (там, где куплен elytrix.pw) создайте **A-записи на IP нового VDS**:

| Тип | Имя | Значение |
|-----|-----|----------|
| A | `@` (elytrix.pw) | IP нового VDS |
| A | `www` | IP нового VDS |
| A | `mc` | IP нового VDS — этот адрес сайт показывает игрокам как IP сервера! |

Пока DNS не обновится, сайт доступен по IP, а сервер — по `IP:25565`.

## Шаг 13. AnyPay (можно сделать и позже)

Без этого сайт работает, но **оплата не будет создаваться**. Возьмите со старого VPS значения из `/root/elytrix/backend/.env` (там были `ANYPAY_MERCHANT_ID`, `ANYPAY_PROJECT_SECRET`, `ANYPAY_API_ID`, `ANYPAY_API_KEY`), подставьте в `/root/site/backend/docker-compose.yml` и пересоздайте backend:

```bash
nano /root/site/backend/docker-compose.yml
cd /root/site/backend && docker compose up -d
```

URL коллбэка в личном кабинете AnyPay менять не нужно — он остаётся `http://elytrix.pw/api/payment/callback`.

## Шаг 14. Перенос данных со старого VPS (по желанию)

Товары/категории/заказы/промокоды лежат в PostgreSQL. На **старом** VPS:

```bash
docker exec -it backend-postgres-1 pg_dump -U elytrix elytrix > /root/pg_dump.sql
```

Перекинуть файл на новый (например, с нового VPS):

```bash
scp root@СТАРЫЙ_IP:/root/pg_dump.sql /root/
docker exec -i backend-postgres-1 psql -U elytrix -d elytrix < /root/pg_dump.sql
```

(команда `psql` — уже с нового VPS, контейнер называется так же: `backend-postgres-1`).

История выдач плагина (MySQL на play2go) не критична — там только выданные/ожидающие заказы; таблица `orders` для плагина создаётся сама. Если есть невыданные покупки — раздайте вручную или выгрузите со старого MySQL хостинга.

## Шаг 15. HTTPS (по желанию, рекомендуется)

```bash
apt install -y certbot python3-certbot-nginx
certbot --nginx -d elytrix.pw -d www.elytrix.pw
```

После этого в `/root/site/backend/docker-compose.yml` поменяйте `SITE_URL: http://elytrix.pw` → `https://elytrix.pw`, добавьте строку `COOKIE_SECURE: 'true'` и примените:

```bash
cd /root/site/backend && docker compose up -d
```

---

## Финальная проверка

1. Сайт: `http://elytrix.pw` — открывается, товары грузятся (значит frontend → backend → PostgreSQL работают).
2. Админка: `http://elytrix.pw/safdjuhos8dfuahj`, пароль `hswa8gh8a-w09gawhp9`.
3. В админке индикатор плагина (Plugin status) — зелёный (значит backend → :20559 работает).
4. Заходите на сервер `mc.elytrix.pw`, в консоли/игре `/elytrixsite status` → `MySQL: OK`, `API: RUNNING`.
5. Тестовая покупка: включите в админке тестовый режим (Настройки) или купите дешёвый товар — после оплаты в игре выдаться донат.

## Шпаргалка команд (обновлённая)

```bash
# --- Сайт ---
pm2 status
pm2 restart frontend && pm2 restart admin
pm2 logs frontend --lines 50
pm2 logs admin --lines 50

# --- Backend / Docker ---
cd /root/site/backend
docker compose ps
docker compose up -d --build      # пересобрать backend после изменений кода
docker compose restart
docker compose logs backend --tail 50
docker compose down && docker compose up -d

# --- Базы ---
docker exec -it backend-postgres-1 psql -U elytrix -d elytrix     # PostgreSQL (\dt, \q)
docker exec -it backend-mysql-1 mysql -u u29470_iHvxVAwYg8 -p s29470_elytrix  # MySQL плагина

# --- Minecraft ---
systemctl status minecraft
systemctl restart minecraft
journalctl -u minecraft -f            # логи сервера (Ctrl+C — выход)

# Консоль сервера (после включения RCON в server.properties):
docker run --rm -i --network host itzg/rcon-cli --host 127.0.0.1 --port 25575 --password ПАРОЛЬ "elytrixsite status"

# --- Nginx ---
nginx -t && systemctl reload nginx
tail -50 /var/log/nginx/error.log

# --- API ---
curl http://127.0.0.1:8080/api/products
curl http://127.0.0.1:8080/api/last-orders

# --- Перезапуск всего ---
cd /root/site/backend && docker compose restart && pm2 restart all && systemctl reload nginx
```

### Обновление кода сайта с GitHub

```bash
cd /root/site && git pull

# backend пересобрать:
cd /root/site/backend && docker compose up -d --build
# frontend/admin пересобрать:
cd /root/site/frontend && npm ci && npm run build && pm2 restart frontend
cd /root/site/admin    && npm ci && npm run build && pm2 restart admin
```

> ⚠️ `docker-compose.yml` вы правили вручную (AnyPay, MySQL). Если `git pull` откажется работать из-за него:
> `cp backend/docker-compose.yml /root/compose.bak && git checkout -- backend/docker-compose.yml && git pull`,
> затем верните свои правки из `/root/compose.bak` (или заново впишите 4 строки AnyPay + блок mysql из Шага 6).


## Быстрые платежи (активная проверка через API AnyPay)

Колбэк (оповещение) от AnyPay может приходить с задержкой и с новых IP, поэтому:
1. IP-фильтр колбэка отключён — защиту несёт проверка подписи SHA256 (`payment.go`).
2. Добавлен эндпоинт `GET /api/payment/verify?pay_id=N` (`verify.go`): бэкенд сам спрашивает
   у AnyPay статус платежа (`GET https://anypay.io/api/payments/{API_ID}?project_id=...`) и,
   если он `paid`, сразу проводит заказ (paid → команды плагину → issued). Страница успеха
   дергает verify каждые 3 сек, пока заказ pending — подтверждение занимает секунды.

**Требование:** в личном кабинете AnyPay → профиль → вкладка **API** должен быть включён API
и добавлен IP сервера сайта (иначе API отвечает `Wrong IP`; эндпоинт тогда просто отдаёт
статус из базы — деградации нет, ждём колбэк как раньше).


## Что нового (сентябрь 2026) и как обновиться

**1. Тех. работы — починены.**
- Обход по IP больше не зависит от `X-Real-IP`: бэкенд проверяет всю цепочку
  (`X-Forwarded-For` + `X-Real-IP` + CF + прямое соединение), понимает IPv6 и нормализует
  `::ffff:`-адреса. При совпадении браузеру ставится cookie `elytrix_bypass` на 7 дней —
  обход переживёт смену IP (мобильный интернет) и перезагрузку страницы.
- Пока вы залогинены в админке (cookie `admin_token`), тех. работы обходятся автоматически
  на всех адресах сайта — IP можно вообще не вносить.
- Фронт стал **fail-closed**: при недоступном бэкенде (деплой/перезапуск/упавший контейнер)
  обычный пользователь продолжает видеть «Тех. работы» с отсчётом, а не пустой сайт.
  Как только бэк ожил — страница сама перезагружается.
- Таймер переписан: считает от серверного времени (`server_time`), не зависит от часов
  браузера, поддерживает «дни» при >24ч, корректно завершается и не «отматывается» после
  сна вкладки. В админке в блоке «Разрешённые IP» показывается IP, как его реально видит сервер.

**2. Периоды оплаты «Неделя / Месяц / Год».** *(заменено свободными вариантами — см. «Вторую волну» ниже)*
У товара в админке можно включить периоды — для каждого своя цена и (опционально) свои
команды. Товар с включёнными периодами продаётся только по периодам, «Разовая» цена
исчезает из корзины покупателя. Период пишется в заказ (видно в админке). Миграция БД
(`product_periods`, `orders.period`) применяется автоматически при старте бэкенда.

**3. Топы на сайте (шапка → «Топы», секция под магазином).**
- «Топ донатеров» — считается по оплаченным заказам сайта (PostgreSQL), топ-10, за всё время.
- «Топ активных» — наигранное время из таблицы `playtime` MySQL-базы плагина.
- Плагин **ElytrixSite 1.1**: копит время онлайн-сессий и выкладывает их в MySQL
  (таблица `playtime` создаётся сама, при onEnable), добавлен подписанный эндпоинт
  `POST /api/leaderboard-playtime`. **Требуется пересборка и замена jar на сервере:**
  ```bash
  cd /root/plugin-src && git pull && mvn -q package
  /root/stop-mc.sh && cp target/ElytrixSite.jar /root/minecraft/plugins/ && /root/start-mc.sh
  ```
  Важно: плагин начинает считать время с момента установки — история «до» не существует,
  топ наполняется по мере игры игроков.
- Ответ `/api/top` кэшируется в Redis на 5 минут (можно принудительно: `/api/top?refresh=1`).
- ~~3D-головы из `minetar.net`~~ — заменено своим прокси `/api/skin` (см. «Вторую волну»).

**4. Discord** — ссылка в футере изменена на `https://dsc.gg/elytrix`.

Обновление сайта целиком (тем же порядком, что и «Обновление кода с GitHub» выше):
`git pull` → пересборка backend (docker) → пересборка frontend/admin (pm2) → замена jar плагина.

---

## Что нового — вторая волна (сентябрь 2026)

**1. Свободные варианты оплаты вместо галочок «Неделя/Месяц/Год».**
В админке (Товары → редактор) теперь конструктор: любое число вариантов, у каждого —
своя подпись («3 дня», «Новогодний», что угодно), цена, срок в днях и свои команды.
Плейсхолдер `%days%` в командах заменяется числом дней варианта — удобно для
автоматизации выдачи: `lp user %player% parent add vip temp %days%d`.
Старая таблица `product_periods` мигрирует в `product_options` автоматически
(при первом старте бэкенда), старые заказы в админке отображаются как раньше
(подпись периода подставляется из снэпшота `orders.option_label`, новые заказы
хранят `option_id` + метку). Покупателю API отдаёт только активные варианты без
команд; цена товара с вариантами показывается как «от N ₽».

**2. Скины для 3D-голов — через Minecraft, своим доменом.**
`GET /api/skin?name=<ник>` (бэкенд) отдаёт PNG текстуры 64x64:
1. бэкенд спрашивает плагин ElytrixSite (`POST /api/skin-urls`) — UUID игрока берётся
   из серверного кэша, текстура — с sessionserver.mojang.com (кэш плагина 12 часов);
2. если плагин не знает ник — бэкенд сам пробует crafatar.com (не браузер!);
3. иначе — процедурный «Стив», голова никогда не бывает пустой.
Кэш: 6 часов в памяти бэкенда, 24 часа в браузере. Больше никаких сторонних хостов
в `<img>` — minetar.net убран. **Нужна пересборка плагина** (тот же блок mvn, что и выше).

**3. Топы — теперь модальное окно, а не секция на странице.**
Кнопка «Топы» в шапке открывает окно (как «Правила»): 2 рейтинга, стрелки листают,
данные подгружаются при первом открытии и обновляются раз в 5 минут, пока окно открыто.
`<Tops/>` из главной страницы убран; якорь `#top` больше не нужен.

**4. «Тех работы не работают у меня» — это обход, теперь с предпросмотром.**
Так и было задумано: пока вы в админке (или IP в whitelist), сайт вам виден даже во
время тех. работ. Чтобы видеть то, что видят игроки: при активных тех. работах сверху
появляется плашка «Смотреть как посетитель» (или ссылка «Как это видит игрок» в
админке → Настройки). Превью живёт в sessionStorage, экран можно выйти кнопкой.
Бэкенд теперь всегда отдаёт честный `maintenance`/`until` + отдельный флаг `bypass` —
решает фронт.

Обновление: `git pull` → `docker compose up -d --build backend` (миграция БД сама) →
пересборка frontend/admin → пересборка и замена jar плагина → рестарт minecraft.

---

## Что нового — третья волна (сентябрь 2026, вечер)

**Головы в топах — красивые, через нормальные API.** `GET /api/skin?name=Ник`
отдаёт готовый PNG-рендер головы: `mc-heads.net/avatar` (настоящий скин, у
игроков без скина — штатный Стив) → `crafatar` → `ely.by/skins` (текстура
премиум/ely/пираток, лицо режет бэкенд) → текстура с сервера через плагин →
встроенный Стив. Всё через наш домен, браузер никуда не ходит. Реальный скин
кэшируется на 6 часов, фолбэк — на 10 минут (когда сервис «починится», голова
обновится сама). Дизайн модалки топов переработан: чистые списки без «стекла»,
медали для топ-3, все 10 мест со скроллом внутри модалки.

**Срок варианта — свободным текстом.** В админке одно поле: «2 недели»,
«48 часов», «1,5 суток», «навсегда», LP-формат «2d12h», голое число = дни.
Плейсхолдеры в командах: `%days%` (дней), `%hours%` (часов), `%dur%`
(токен LuckPerms: `lp user %player% parent add vip temp %dur%` → `temp 2d12h`).
В БД: `product_options.duration_hours/dur/duration_text` (миграция автоматом).

**Картинки товаров — загрузка напрямую.** В редакторе товара поле «Картинка»
теперь и URL принимает, и кнопку «Файл» (PNG/JPG/GIF/WebP до 900 КБ). Файлы
хранятся в PostgreSQL (таблица `product_images`, создаётся миграцией сама) и
отдаются сайтом по `/uploads/<имя>.png` (Next проксирует на бэкенд; кэш
immutable — у каждого файла уникальное имя). Переживают пересборку контейнера,
том монтировать не надо. После обновления пересобери frontend (изменился
next.config.js) и restarted pm2 — rewrite применяется только после рестарта.
