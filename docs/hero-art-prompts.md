# Промпты для арта героев «Арена Менеджер»

Этот файл нужен, когда вы захотите заменить векторных героев на нарисованных художником или нейросетью (Midjourney, Stable Diffusion, DALL·E, Leonardo и т. п.). Сейчас в игре векторные модели из `src/art.ts`. Описания ниже совпадают с ними, поэтому новый арт останется узнаваемым для игроков.

## Как пользоваться

1. Сначала сгенерируйте **одного** героя с общим стилем (блок «Общий стиль» + промпт героя). Выберите удачный вариант.
2. Для остальных героев используйте эту картинку как референс стиля (в Midjourney `--sref <ссылка>`, в SD — IP-Adapter, в Leonardo — Style Reference). Так все 20 будут в одном стиле.
3. Промпты на английском: нейросети понимают его лучше.
4. Готовые картинки положите в `public/heroes/<id>.png` (id указан у каждого героя). Я подключу их к той же системе анимации, что и сейчас.

## Технические требования

- PNG с прозрачным фоном, 1024×1024, герой целиком, ноги внизу по центру.
- Вид сбоку в три четверти, герой **смотрит вправо**.
- Нейтральная стойка, руки чуть отведены от тела, оружие в правой (дальней от зрителя) руке не перекрывает лицо.
- Для анимации лучше всего: отдельные слои (голова, туловище, каждая рука с оружием, каждая нога, плащ). Если нейросеть так не умеет, хватит цельной картинки, а части я вырежу сам.
- Портрет для драфта: отдельный кадр по пояс, 512×512, тот же ракурс.

## Общий стиль (добавлять в начало каждого промпта)

```
stylized 2D game character, chibi-heroic proportions (large head, sturdy body), clean bold dark outline, cel shading with 2 tones plus rim light, vibrant saturated palette, readable silhouette at small size, mobile strategy game art, full body, side three-quarter view facing right, neutral standing pose, transparent background, no text, no logo
```

Негативный промпт (для SD и Leonardo):

```
photorealistic, 3d render, blurry, extra limbs, extra fingers, cropped, text, watermark, logo, background scenery, multiple characters, copyrighted character
```

## Герои

### Стражи

**Гранит** (`granite`), Каменный страж
```
a massive stone golem knight made of grey granite blocks, boulder-like shoulders covered with moss, glowing amber runes carved on the chest, slit visor with glowing amber eyes, carries a huge rectangular stone slab shield with a glowing rune in the center, heavy and slow
```

**Якорь** (`anchor`), Портовый громила
```
a big-bellied harbor brawler sailor, thick black beard, navy wool cap, striped white-and-blue sailor shirt under an open blue vest, red scarf, rolled sleeves with an anchor tattoo, swings a heavy iron ship anchor on a short chain
```

**Хранитель** (`warden`), Страж рощи
```
a treant knight made of living bark, wooden mask helmet with large deer-antler branches, mossy shoulder pads, glowing green eyes and a green heart-light in the chest, holds a giant leaf-shaped shield with visible veins
```

**Бастион** (`bastion`), Осадная броня
```
a walking iron siege suit, boxy steel armor with rusty orange shoulder plates, hazard stripes on the belt, glowing orange furnace core in the chest, narrow glowing visor slit, two smoking exhaust pipes on the back, antenna with red light, one arm ends in a three-pronged mechanical claw
```

### Бойцы

**Вихрь** (`vortex`), Мастер клинка
```
a lean swift swordsman with long flowing white hair and a red headband, dark navy high-collar long coat with tails, red sash belt, calm sharp eyes, holds a long slim single-edged sword with a golden guard
```

**Уголёк** (`ember`), Кузнец войны
```
a stocky dwarf-like blacksmith warrior, bald head with brass goggles on the forehead, a beard made of living fire, bare muscular arms, leather apron with tools, wields a heavy forge hammer whose striking face glows red-hot
```

**Бивень** (`tusk`), Степной наездник
```
a steppe barbarian warrior, iron helmet with two large curved bone horns, shaggy fur mantle, bare chest with red war paint stripes, braided beard, holds a long spear tipped with a curved ivory tusk and red cloth bindings
```

**Кирпич** (`brick`), Уличный боец
```
a broad-shouldered street brawler, buzz cut, red bandana with white dots, white tank top, olive cargo pants, chain on the belt, small scar on the face, fists wrapped in white boxing tape, no weapon, ready to punch
```

### Стрелки

**Ястреб** (`hawk`), Лесной лучник
```
a hooded forest ranger, green hood and tabard over leather armor, cloak with a fringe of brown feathers, cloth mask over the lower face, quiver of white-fletched arrows on the back, holds a tall wooden longbow
```

**Перо** (`quill`), Небесная охотница
```
a winged sky huntress, large white feathered wings, blonde ponytail, golden circlet with a small feather, teal light armor with a cream pleated skirt, holds an elegant golden recurve bow with a glowing gem
```

**Болт** (`bolt`), Механик-арбалетчик
```
a young goggled engineer, big brass goggles with glowing cyan lenses, messy brown hair, orange work jumpsuit with leather straps and pouches, backpack with a large brass gear and pipes, carries a heavy steel crossbow with a gear mechanism
```

### Маги

**Аврора** (`aurora`), Хранительница пламени
```
a young fire sorceress with hair made of living flames, crimson robe with golden trim and belt, amber eyes, golden earrings, holds a wooden staff topped with a golden crescent holding a blazing fire orb
```

**Иней** (`frost`), Северный чародей
```
a tall old ice wizard, crown of pale blue ice crystals, very long white frosty beard, blue robe with white fur collar and hem, snowflake emblem on the chest, dark blue fur cloak, holds a pale staff topped with a big glowing ice crystal
```

**Мудрец** (`sage`), Хранитель книг
```
an old scholar wizard, enormous floppy purple pointed hat decorated with golden stars, round brass spectacles, long grey beard, purple starry robe with a golden rope belt, an open glowing spellbook floats beside his hand
```

### Поддержка

**Ива** (`willow`), Лесная целительница
```
a gentle dryad healer, long hair made of green leaves with a pink flower, light skin with a slight green tint, green leaf dress with a petal-shaped hem, holds a twisted vine staff with pink blossoms and a soft green glow
```

**Люмен** (`lumen`), Светоносец
```
a serene priest of light, golden glowing halo above the head, short golden hair, closed calm eyes, white robe with a golden central stripe and sun emblem, holds a small golden lantern with a bright warm light
```

**Звон** (`chime`), Монах-колокол
```
a bald warrior monk, three dots tattooed on the forehead, serene closed eyes, orange robe draped over one shoulder, wooden prayer beads around the neck, wrapped wrists, a large bronze temple bell strapped to his back, fights barehanded
```

### Убийцы

**Тень** (`shade`), Ночной клинок
```
a shadow assassin, dark purple hood, pale featureless mask with two glowing violet eye slits, cloth wrap over the mouth, tattered smoky black cloak dissolving into purple mist, crossed leather straps, twin curved daggers with violet hilts
```

**Клык** (`fang`), Дикий охотник
```
a grey wolf beastman, wolf head with pointed ears, yellow predatory eyes and visible fangs, light fur mane, open leather vest, bushy tail, long white curved claws on both hands, crouched ready to pounce
```

**Жнец** (`reaper`), Полевой призрак
```
a haunted scarecrow spirit floating above the ground, burlap sack head with stitched mouth and glowing green eyes, wide straw hat, ragged patched green coat with tattered hem, straw sticking out of the sleeves and collar, holds a long rusty scythe
```

## Если заказывать у художника

Передайте этот файл целиком и скриншот текущих векторных моделей. Попросите сделать каждого героя отдельными слоями (PSD или Spine/DragonBones), тогда анимация будет плавнее, чем у цельной картинки.
