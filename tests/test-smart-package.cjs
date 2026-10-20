const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const js=path.join(__dirname,'../app/src/main/assets/js');
const SmartPackage=require(path.join(js,'smart-package.js'));
const files=[
 'My fantasy pack/models/Wall_01.glb',
 'My fantasy pack/textures/Wall_01_basecolor.png',
 'My fantasy pack/Гобелены/Королевский гобелен.jpg',
 'My fantasy pack/Картины/Страж.png',
 'My fantasy pack/Облицовка наружная/Stone_Dark.png',
 'My fantasy pack/models/Wall_Corner90.glb',
 'My fantasy pack/Гобелены/Wall_Corner90.png'
];
const plan=SmartPackage.analyze(files);
assert.equal(plan.models.length,2);
assert.equal(plan.pictures.length,3);
assert.equal(plan.textures.length,2);
assert.equal(plan.models[0].category,'wall');
assert.equal(plan.models[1].category,'corner');
assert.equal(plan.bindings.get(files[0]).slots[0].path,files[1],
 'Exact basecolor texture is linked to corresponding GLB');
assert.equal(plan.bindings.has(files[5]),false,
 'A painting with a similar filename must never overwrite a GLB material');
assert.equal(SmartPackage.lookup(files,'textures/wall_01_basecolor.png'),files[1],
 'Nested archives resolve one extra package root');
const ambiguous=SmartPackage.analyze([
 'models/Pillar01.glb','texture/Pillar01_albedo.png','texture/Pillar01_basecolor.jpg']);
assert.equal(ambiguous.bindings.size,0,'Ambiguous assets require user review instead of false links');
const explicit=SmartPackage.analyze(['pack/models/wall.glb','pack/images/a.png'],{
 models:[{path:'models/wall.glb',category:'wall',materials:[{name:'Main',texture:'images/a.png'}]}],
 images:[{path:'images/a.png',role:'painting'}]
});
assert.equal(explicit.pictures.length,1);
assert.equal(explicit.bindings.get('pack/models/wall.glb').slots[0].name,'Main');
assert.equal(explicit.bindings.get('pack/models/wall.glb').slots[0].path,'pack/images/a.png');
// Real-world Russian folder names are descriptive and must not be renamed.
const rus=SmartPackage.analyze([
 'Мой замок/Модели/Стены/Прямая белая стена.glb',
 'Мой замок/Модели/Углы/Угол_90.glb',
 'Мой замок/Материалы/Облицовка внутренняя/Белая штукатурка.png',
 'Мой замок/Материалы/Наружная облицовка/Серый кирпич.jpg',
 'Мой замок/Картины на стену/Рыцарь.jpg',
 'Мой замок/Большие гобелены/Гобелен дракона.png',
 'Мой замок/Настенные фрески/Солнце.webp',
 'Мой замок/Фото и постеры/Семья.png',
 'Мой замок/Обои/Орнамент.png'
]);
assert.equal(rus.models.length,2);
assert.equal(rus.models[0].category,'wall');
assert.equal(rus.models[1].category,'corner');
assert.equal(rus.textures.length,3,'Russian inside/outside finishes and wallpaper stay repeating textures');
assert.equal(rus.pictures.length,4,'Descriptive Russian painting and tapestry folders become single artwork');
assert.equal(SmartPackage.kind('Картины/Гобелен.png'),'painting');
assert.equal(SmartPackage.kind('Наружная облицовка/Камень.png'),'texture');
assert.equal(SmartPackage.normalizedRole('Внутренняя облицовка'),'texture');
const ruMetadata=SmartPackage.analyze(['Папка/Модели/001.glb'],{
 models:[{path:'Модели/001.glb',category:'Стены'}]
});
assert.equal(ruMetadata.models[0].category,'wall',
 'The optional ZIP metadata may also use Russian category names');
assert.equal(SmartPackage.normalizeCategory('Полы','001.glb'),'foundation');
assert.equal(SmartPackage.normalizeCategory('Углы','001.glb'),'corner');
// Screenshot/video showed an actual Android SD-card layout. Its top-level
// folder "textures" must not override deeper "картины габилены" / "Декали".
const actual=SmartPackage.analyze([
 'All_Building_Libraries_GLB_RU/textures/МоиТекстуры/плитка/Камень_001.jpg',
 'All_Building_Libraries_GLB_RU/textures/МоиТекстуры/Декали/Золотой_герб.png',
 'All_Building_Libraries_GLB_RU/textures/МоиТекстуры/картины габилены/Король.png',
 'All_Building_Libraries_GLB_RU/textures/МоиТекстуры/габилены/Знамя.jpg',
 'All_Building_Libraries_GLB_RU/XQCQ_255/Стена_угловая_90.glb'
]);
assert.equal(actual.textures.length,1,'Tile stays repeatable');
assert.equal(actual.pictures.length,3,'Decals, pictures and the variant габилены stay one-off artwork');
assert.equal(actual.models.length,1);
assert.equal(actual.models[0].category,'corner');
assert.equal(SmartPackage.kind('габилены/Геральдика.png'),'painting');
console.log('Automatic ZIP roles, metadata, nested paths and conservative model materials OK');
