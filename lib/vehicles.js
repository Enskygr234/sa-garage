'use strict';
// San Andreas araç model adları (dff dosya adı) → okunur ad
const NAMES = 'landstal bravura buffalo linerun peren sentinel dumper firetruk trash stretch manana infernus voodoo pony mule cheetah ambulan leviathn moonbeam esperant taxi washing bobcat mrwhoop bfinject hunter premier enforcer securica banshee predator bus rhino barracks hotknife artict1 previon coach cabbie stallion rumpo rcbandit romero packer monster admiral squalo seaspar pizzaboy tram artict2 turismo speeder reefer tropic flatbed yankee caddy solair topfun skimmer pcj600 faggio freeway rcbaron rcraider glendale oceanic sanchez sparrow patriot quad coastg dinghy hermes sabre rustler zr350 walton regina comet bmx burrito camper marquis baggage dozer maverick vcnmav rancher fbiranch virgo greenwoo jetmax hotring sandking blistac polmav boxville benson mesa rcgoblin hotrina hotrinb bloodra rnchlure supergt elegant journey bike mtbike beagle cropdust stunt petro rdtrain nebula majestic buccanee shamal hydra fcr900 nrg500 copbike cement towtruck fortune cadrona fbitruck willard forklift tractor combine feltzer remingtn slamvan blade freight streak vortex vincent bullet clover sadler firela hustler intruder primo cargobob tampa sunrise merit utility nevada yosemite windsor monstera monsterb uranus jester sultan stratum elegy raindanc rctiger flash tahoma savanna bandito freiflat streakc kart mower duneride sweeper broadway tornado at400 dft30 huntley stafford bf400 newsvan tug petrotr emperor wayfarer euros hotdog club freibox artict3 androm dodo rccam launch copcarla copcarsf copcarvg copcarru picador swatvan alpha phoenix glenshit sadlshit bagboxa bagboxb tugstair boxburg farmtr1 utiltr1'.split(' ');

const PRETTY = {
  landstal: 'Landstalker', linerun: 'Linerunner', peren: 'Perennial', firetruk: 'Fire Truck', trash: 'Trashmaster',
  ambulan: 'Ambulance', leviathn: 'Leviathan', esperant: 'Esperanto', washing: 'Washington', mrwhoop: 'Mr. Whoopee',
  bfinject: 'BF Injection', securica: 'Securicar', hotknife: 'Hotknife', artict1: 'Römork', artict2: 'Römork',
  artict3: 'Römork', rcbandit: 'RC Bandit', pizzaboy: 'Pizzaboy', solair: 'Solair', topfun: 'Topfun', pcj600: 'PCJ-600',
  rcbaron: 'RC Baron', rcraider: 'RC Raider', coastg: 'Coastguard', zr350: 'ZR-350', vcnmav: 'News Chopper',
  fbiranch: 'FBI Rancher', greenwoo: 'Greenwood', hotring: 'Hotring Racer', blistac: 'Blista Compact',
  polmav: 'Police Maverick', rcgoblin: 'RC Goblin', hotrina: 'Hotring Racer A', hotrinb: 'Hotring Racer B',
  bloodra: 'Bloodring Banger', rnchlure: 'Rancher Lure', supergt: 'Super GT', mtbike: 'Mountain Bike',
  cropdust: 'Cropduster', rdtrain: 'Roadtrain', buccanee: 'Buccaneer', fcr900: 'FCR-900', nrg500: 'NRG-500',
  copbike: 'HPV1000', towtruck: 'Towtruck', fbitruck: 'FBI Truck', remingtn: 'Remington', firela: 'Fire Truck (merdivenli)',
  monstera: 'Monster A', monsterb: 'Monster B', raindanc: 'Raindance', rctiger: 'RC Tiger', freiflat: 'Yük vagonu',
  streakc: 'Yolcu vagonu', duneride: 'Dune', at400: 'AT-400', dft30: 'DFT-30', bf400: 'BF-400', newsvan: 'Newsvan',
  petrotr: 'Petrol römorku', freibox: 'Kapalı vagon', androm: 'Andromada', rccam: 'RC Cam',
  copcarla: 'Polis (Los Santos)', copcarsf: 'Polis (San Fierro)', copcarvg: 'Polis (Las Venturas)', copcarru: 'Polis Ranger',
  swatvan: 'S.W.A.T.', glenshit: 'Glendale (hurda)', sadlshit: 'Sadler (hurda)', bagboxa: 'Bagaj römorku A',
  bagboxb: 'Bagaj römorku B', tugstair: 'Merdiven römorku', boxburg: 'Boxville', farmtr1: 'Çiftlik römorku', utiltr1: 'Utility römorku'
};

const BY_NAME = new Map(NAMES.map((n, i) => [n, { id: 400 + i, model: n, name: PRETTY[n] || n.charAt(0).toUpperCase() + n.slice(1) }]));

const BIKES = new Set(['bmx', 'bike', 'mtbike', 'pcj600', 'faggio', 'freeway', 'sanchez', 'fcr900', 'nrg500', 'copbike', 'bf400', 'wayfarer', 'pizzaboy', 'quad']);
const AIR = new Set(['leviathn', 'hunter', 'seaspar', 'skimmer', 'sparrow', 'rustler', 'maverick', 'vcnmav', 'polmav', 'beagle', 'cropdust', 'stunt', 'shamal', 'hydra', 'cargobob', 'nevada', 'raindanc', 'at400', 'androm', 'dodo']);
const BOATS = new Set(['predator', 'squalo', 'speeder', 'reefer', 'tropic', 'coastg', 'dinghy', 'marquis', 'jetmax', 'launch']);

function lookup(fileBase) {
  return BY_NAME.get(String(fileBase).toLowerCase()) || null;
}
function kind(model) {
  if (BIKES.has(model)) return 'Motosiklet';
  if (AIR.has(model)) return 'Hava aracı';
  if (BOATS.has(model)) return 'Tekne';
  return 'Araç';
}

module.exports = { lookup, kind, all: () => [...BY_NAME.values()] };
