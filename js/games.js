const VERSION = "0009"; // cámbialo cada vez que subas algo

// =============================================
//  CONFIGURACIÓN DE JUEGOS
//  Edita solo este archivo para añadir juegos
// =============================================

const GAMES = [
  {
    id: 1,
    name: "Contra",
    core: "nes",
    rom: "https://files.camiloh.co/contra.nes",
    cover: "./covers/contra.webp",   // imagen optimizada
    sizeMB: 0.13,                    // peso aproximado en MB
    // layout: "default" | "diamond" | "nes"
    controls: "nes"
  },
  {
    id: 2,
    name: "Metal Slug 2",
    core: "arcade",
    rom: "https://files.camiloh.co/mslug.zip",
    bios: "neogeo.zip",
    cover: "./covers/mslug2.webp",
    sizeMB: 17.8,
    controls: "default"
  },
  {
    id: 3,
    name: "Metal Slug 3",
    core: "arcade",
    rom: "https://files.camiloh.co/mslug3.zip",
    cover: "./covers/mslug3.webp",
    sizeMB: 81,
    controls: "default"
  },
    {
    id: 4,
    name: "Super Mario Bros",
    core: "nes",
    rom: "./roms/SuperMarioBros.nes",
    cover: "./covers/supermario.webp",
    sizeMB: 0.04,
    controls: "nes"
  },
  {
    id: 5,
    name: "Bloody Roar",
    core: "psx",
    rom: "https://files.camiloh.co/bloody-roar.zip",
    cover: "./covers/blody.webp",
    sizeMB: 277,
    controls: "diamond"              // rombo: Y X / B A
  },
  {
    id: 6,
    name: "Road Fighter",
    core: "nes",
    rom: "./roms/roadf.nes",
    cover: "./covers/road-fighter.webp",
    sizeMB: 0.03,
    controls: "nes"
  },
  {
    id: 7,
    name: "King Of Fighters 98",
    core: "arcade",
    rom: "https://files.camiloh.co/kof98.zip",
    bios: "https://files.camiloh.co/neogeo.zip",
    cover: "./covers/road-fighter.webp",
    sizeMB: 0.03,
    controls: "default"
  }
];

// Layouts de controles virtuales (fácil de ampliar)
const CONTROL_LAYOUTS = {
  // NES / 2 botones en columna
  nes: [
    { type: "dpad", location: "left", left: "12%", top: "55%", joystickInput: false, inputValues: [4, 5, 6, 7] },
    { type: "button", text: "B", id: "b", location: "right", left: 20, top: 70, bold: true, input_value: 0 },
    { type: "button", text: "A", id: "a", location: "right", left: 80, top: 40, bold: true, input_value: 8 },
    { type: "button", text: "Start", id: "start", location: "center", left: 55, top: 40, fontSize: 13, block: true, input_value: 3 },
    { type: "button", text: "Select", id: "select", location: "center", left: -20, top: 40, fontSize: 13, block: true, input_value: 2 }
  ],

  // PSX / 4 botones en ROMBO
  //        Y
  //      X   B
  //        A
  diamond: [
    { type: "dpad", location: "left", left: "12%", top: "55%", joystickInput: false, inputValues: [4, 5, 6, 7] },
  
    // Rombo más a la izquierda (right más alto en CSS se aplica aparte)
    { type: "button", text: "Y", id: "y", location: "right", left: 45, top: 5, bold: true, input_value: 9 },
    { type: "button", text: "X", id: "x", location: "right", left: 5, top: 45, bold: true, input_value: 1 },
    { type: "button", text: "B", id: "b", location: "right", left: 85, top: 45, bold: true, input_value: 0 },
    { type: "button", text: "A", id: "a", location: "right", left: 45, top: 85, bold: true, input_value: 8 },
  
    { type: "button", text: "Start", id: "start", location: "center", left: 55, top: 40, fontSize: 13, block: true, input_value: 3 },
    { type: "button", text: "Select", id: "select", location: "center", left: -20, top: 40, fontSize: 13, block: true, input_value: 2 }
  ],

  // Por defecto (EmulatorJS decide)
  default: null
};
