// The story is told in short cards by ORRERY, the course's caretaker computer.
export const SPEAKER = "ORRERY · course caretaker";

export const PROLOGUE = [
  "Long ago, someone built a golf course across an entire star system. They called it the Perihelion Links.",
  "Its sun, Perihel, has burned low. The cups went dark one by one, and the players stopped coming.",
  "You are the last groundskeeper. Every ball you sink relights a cup. Relight them all, and Perihel might wake.",
];

export const CHAPTER_STORY = {
  c1: {
    open: ["The Inner Links. The gentlest holes, built for beginners.", "Start here. The old planets still remember how to play."],
    close: ["Nine cups glowing. The inner planets look warmer already.", "Further out, something has been eating the light."],
  },
  c2: {
    open: ["Hollow Reach. The builders fenced their black holes in with red stars.", "Don't fall in. Nothing that falls in comes back."],
    close: ["The Reach is lit. I can see Perihel from here.", "Next is the Veil, a sea of gas where distances lie."],
  },
  c3: {
    open: ["The Veil. The clouds slow everything down, and the wormholes stitch the far side to the near.", "The builders loved this course. You can tell."],
    close: ["Twenty-seven cups. Perihel stirred just now. I'm sure of it.", "Only the Court is left, where the pulsars keep time."],
  },
  c4: {
    open: ["Perihel's Court. The last nine holes, played to the beat of dead stars.", "Everything you have learned, all at once. I believe in you."],
    close: [
      "The last cup lights. For a moment, nothing happens.",
      "Then Perihel takes a breath, and the whole system turns gold.",
      "The Links are open again. Thank you, groundskeeper. A new Daily Orbit hole will be waiting for you every day.",
    ],
  },
};

// Short remarks after a hole, picked by result. Keeps the caretaker present without slowing play.
export const QUIPS = {
  ace: ["Straight in. I'm writing that one down.", "One stroke. The builders would have applauded.", "Perfect line."],
  under: ["Under par. Very tidy.", "That's a birdie in any star system.", "The planets approve."],
  par: ["Par. Solid work.", "Right on the number.", "Steady hands."],
  over: ["It went in. That's what counts.", "Every cup lit is a cup lit.", "Space is big. You'll get it next time."],
};
