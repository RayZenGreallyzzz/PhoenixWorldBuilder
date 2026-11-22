# Phoenix Engine → Unity / Unreal (world portability bridge, 2.1.3)

**Слой мира без персонажей.** Этот мост не переносит NPC, мобов, аккаунты,
скрипты или боевые механики. Все исходные файлы обрабатываются локально.

## На Android

1. В Phoenix Engine открой **🗂 СЛОИ МИРА**.
2. Нажми **🎮 Экспорт для Unity / Unreal (GLB + JSON)**.
3. Сохрани последовательно два файла **в одну папку**:
   - `PhoenixBuilder_Scene.glb` — экспортированные здания/деревья/статические GLB
     с материалами, UV и оригинальными координатами;
   - `Phoenix_World_Map.phoenix.json` — самостоятельный слой карты: размеры,
     высоты, ландшафт, текстуры, объекты и метаданные коллизий.
4. Для мира без построек нужен только второй файл.

Android сохранит файлы через штатное окно выбора места. **Экспорт не удаляет
объекты в Builder и не подменяет ручное сохранение проекта.**

## На компьютере (Python 3.9+)

```bash
python tools/phoenix-portability/convert.py Phoenix_World_Map.phoenix.json --geometry PhoenixBuilder_Scene.glb --out Phoenix_World_Ready
```

Результат:
- `World.json` — метаданные объектов и предполагаемые коллизии.
- `Geometry/PhoenixBuilder_Scene.glb` — геометрия и материалы.
- `Models/` и `Textures/` — исходные файлы из .phoenix.json.
- `Terrain/Terrain_Unity.obj`, `Terrain_Unreal.obj` и `Terrain.mtl` —
  геометрия ландшафта по сетке высот (5 м, максимум 257×257 узлов для
  больших миров).

**Внимание:** отдельные GLB в `Models/` содержат исходные ассеты. Они уже
учтены в общей геометрии сцены и не должны повторно расставляться поверх
ней: иначе появятся дубликаты деревьев и домов.

## Unity

Установи редакторский пакет [Unity glTFast](https://github.com/Unity-Technologies/com.unity.cloud.gltfast)
(`com.unity.cloud.gltfast`) через Package Manager.

Скопируй `unity/PhoenixWorldImporter.cs` в
`Assets/Editor/PhoenixWorldImporter.cs` Unity-проекта.

Открой **Tools → Phoenix Engine → Import Phoenix World...** и выбери
`Phoenix_World_Ready/World.json`.

Импортер копирует исходные ассеты в `Assets/PhoenixWorld/`,
создаёт на сцене геометрию, рельеф и базовые MeshCollider для
поддерживаемых категорий. Сохрани сцену.

## Unreal Engine 5.6+

Включи плагины **Python Editor Script**, **Interchange**, импорт glTF/GLB.
Открой нужный Level и запусти `unreal/import_phoenix_world.py`
из **Tools → Execute Python Script**.

В переменной окружения `PHOENIX_WORLD_JSON` перед запуском задай
абсолютный путь к `Phoenix_World_Ready/World.json` (либо пропиши путь
в скрипте). Interchange Import Scene импортирует узлы GLB и трансформации;
отдельно импортируется рельеф из `Terrain_Unreal.obj` (в сантиметрах).

## Ограничения и проверки

- Контуры домов, GLB-материалы и текстуры в отрендеренном GLB переносимы,
  однако перенос нестандартных шейдеров и смешивания текстур рельефа
  **не автоматизирован**. Исходные `paintMasks` сохраняются в `World.json`.
- Коллизии восстановимы по данным, но нужно проверить физику, двери,
  объекты с нестандартной геометрией, мосты и масштаб.
- Unreal Import Scene/Collision требует реальной проверки версии плагина и
  настроек проекта; мы **не заявляем готовый Unreal-проект одним нажатием**.
- Скрипты импорта не переносят навыки, сервер или игровые аккаунты.
- Координаты Phoenix — **метры, Three.js Y-up**.
- Отдельная геометрия сцены обязательна, если на карте есть постройки.

Скрипты Python не требуют внешних библиотек и не обращаются в интернет.
