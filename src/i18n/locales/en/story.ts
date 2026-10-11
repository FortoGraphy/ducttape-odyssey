// "story" namespace (en). Owned by one agent, see docs/ARCHITECTURE.md. Keys must match the other language.
// Story overlay chrome: beats, chapter cards, the ending choice and the first-run intro.
const story = {
  continue: "Continue",
  skip: "Skip",
  tapToContinue: "Tap to continue",
  chapter: "Chapter {{n}}",
  chapterBeat: "Chapter {{chapter}} · {{n}}/{{total}}",
  speaker: {
    kipp: "KIPP",
    signal: "The Signal",
    log: "Ship's Record",
    narrator: "Meanwhile",
    crew: "Crew",
  },
  ending: {
    title: "Ticket Number One",
    epilogue: "Resolved",
    intro: "The service desk is waiting for an answer. The signal plays its hold music and somebody has finally picked up. What do you tell them?",
    choose: "This one",
    confirm: "Really. Confirm",
    final: "The answer is final. The game carries on.",
    later: "Let me think about it",
    backlog: "Open the Backlog",
  },
  intro: {
    cryoKicker: "Cryo pod 3 · maintenance",
    cryoLcd: "GOOD MORNING",
    cryoWarn: "YOUR WAKE-UP CALL WAS DELAYED BY 14 600 DAYS · WE APOLOGISE FOR THE INCONVENIENCE · COFFEE IS NOT AVAILABLE",
    cryoText: "The cryo pod lid slides back with visible reluctance. You are cold, everything hurts, and the ship is quiet in a way ships are never supposed to be. The tug S.S. Gaffer is drifting. Somewhere.",
    note: "Back in 5 minutes.",
    noteSign: "The crew. Going by the dust on the tape, about forty years ago.",
    noteText: "The note is taped to the bridge door. The suits are gone, the shuttle is gone, and there is a mug in the sink that has since developed an ecosystem of its own.",
    kippRole: "Ship computer, propulsion and plumbing",
    kippLine: "Ah, the Engineer Third Class. Welcome back. To summarise: no crew, no warranty, the hull is holding mostly out of habit, and somebody keeps calling us. I suggest we start with mining. It is the one thing we are good at.",
    badgeTitle: "Service badge",
    nameLabel: "Engineer's name",
    shipLabel: "Ship's name",
    renameHint: "You can leave these alone. KIPP will call you whatever he likes anyway.",
    skip: "Skip",
    start: "Clock in",
  },
} as const;

export default story;
