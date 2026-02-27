(function (window) {
// ═══════════════════════════════════════════════════════════════
// JASON EDWARDS TRAVEL — DRIVER DUTY PORTAL
// Real data from duty cards PDF and weekly rota
// ═══════════════════════════════════════════════════════════════
const DUTY_CARDS = {
  // ── A6 EARLY DUTIES (200 series) ──────────────────────────
  201: {
    number: 201,
    days: "Monday to Friday",
    route: "Route A6 — Stansted Airport",
    signOn: "01:20",
    signOff: "13:40",
    dutyLength: "12:20",
    coach: "Coach 1",
    reminders: ["Ensure you have a 45 minute break", "Record travel movement as other work on tachograph", "When on a motorway you are in control of your excess speed"],
    tubeInfo: "Tube departs at 13:02",
    segments: [{
      title: "Preparation",
      stops: [{
        stop: "Sign On — Walk round check Coach 1",
        time: "01:20"
      }, {
        stop: "Empty to Paddington Station",
        time: "01:40"
      }, {
        stop: "Arrive for loading",
        time: "02:40"
      }]
    }, {
      title: "Trip 1 — Paddington → Stansted",
      stops: [{
        stop: "Paddington Station Stop 15",
        time: "02:45",
        dep: true
      }, {
        stop: "Baker Street Marylebone Rd Stop V",
        time: "02:53"
      }, {
        stop: "St John's Wood Lord's Stop Z",
        time: "02:58"
      }, {
        stop: "Finchley Road Tube Station Stop CL",
        time: "03:03"
      }, {
        stop: "Finchley Road Train Station Stop FD",
        time: "03:06"
      }, {
        stop: "Golders Green Bus Station Stop GE",
        time: "03:19"
      }, {
        stop: "Stansted Airport Coach Station",
        time: "04:30",
        arr: true
      }]
    }, {
      title: "Trip 2 — Stansted → Paddington",
      stops: [{
        stop: "Pull on stand",
        time: "05:55"
      }, {
        stop: "Stansted Airport Coach Station",
        time: "06:05",
        dep: true
      }, {
        stop: "Golders Green Finchley Road Stop GV",
        time: "07:25"
      }, {
        stop: "Finchley Road Train Station Stop FF",
        time: "07:36"
      }, {
        stop: "Finchley Road Tube Station Stop CH",
        time: "07:37"
      }, {
        stop: "St John's Wood Lord's Stop K",
        time: "07:41"
      }, {
        stop: "Baker Street Stop A",
        time: "07:45"
      }, {
        stop: "Paddington Station Stop 15",
        time: "07:51",
        arr: true
      }]
    }, {
      title: "Trip 3 — Paddington → Stansted",
      stops: [{
        stop: "Paddington Station Stop 15",
        time: "07:55",
        dep: true
      }, {
        stop: "Baker Street Marylebone Rd Stop V",
        time: "08:05"
      }, {
        stop: "St John's Wood Lord's Stop Z",
        time: "08:10"
      }, {
        stop: "Finchley Road Tube Station Stop CL",
        time: "08:17"
      }, {
        stop: "Finchley Road Train Station Stop FD",
        time: "08:20"
      }, {
        stop: "Golders Green Bus Station Stop GE",
        time: "08:35"
      }, {
        stop: "Stansted Airport Coach Station",
        time: "09:50",
        arr: true
      }]
    }, {
      title: "Trip 4 — Stansted → Paddington",
      stops: [{
        stop: "Pull on stand",
        time: "11:00"
      }, {
        stop: "Stansted Airport Coach Station",
        time: "11:10",
        dep: true
      }, {
        stop: "Golders Green Bus Station Stop GE",
        time: "12:20"
      }, {
        stop: "Finchley Road Train Station Stop FF",
        time: "12:31"
      }, {
        stop: "Finchley Road Tube Station Stop CH",
        time: "12:32"
      }, {
        stop: "St John's Wood Lord's Stop K",
        time: "12:40"
      }, {
        stop: "Baker Street Stop A",
        time: "12:45"
      }, {
        stop: "Paddington Station Stop 15",
        time: "12:51",
        arr: true,
        notes: "Hand over Coach 1 to Duty 206"
      }]
    }, {
      title: "Return to Depot",
      stops: [{
        stop: "Travel on Tube back to Depot",
        time: "13:02",
        notes: "Tube departs 13:02"
      }, {
        stop: "Sign Off",
        time: "13:40"
      }]
    }]
  },
  261: {
    number: 261,
    days: "Saturday & Sunday",
    route: "Route A6 — Stansted Airport",
    signOn: "01:20",
    signOff: "13:40",
    dutyLength: "12:20",
    coach: "Coach 1",
    reminders: ["Ensure you have a 45 minute break", "Record travel movement as other work on tachograph", "When on a motorway you are in control of your excess speed"],
    tubeInfo: "Tube departs at 13:02",
    segments: [{
      title: "Preparation",
      stops: [{
        stop: "Sign On — Walk round check Coach 1",
        time: "01:20"
      }, {
        stop: "Empty to Paddington Station",
        time: "01:40"
      }, {
        stop: "Arrive for loading",
        time: "02:40"
      }]
    }, {
      title: "Trip 1 — Paddington → Stansted",
      stops: [{
        stop: "Paddington Station Stop 15",
        time: "02:45",
        dep: true
      }, {
        stop: "Baker Street Marylebone Rd Stop V",
        time: "02:53"
      }, {
        stop: "St John's Wood Lord's Stop Z",
        time: "02:58"
      }, {
        stop: "Finchley Road Tube Station Stop CL",
        time: "03:03"
      }, {
        stop: "Finchley Road Train Station Stop FD",
        time: "03:06"
      }, {
        stop: "Golders Green Bus Station Stop GE",
        time: "03:19"
      }, {
        stop: "Stansted Airport Coach Station",
        time: "04:30",
        arr: true
      }]
    }, {
      title: "Trip 2 — Stansted → Paddington",
      stops: [{
        stop: "Pull on stand",
        time: "06:05"
      }, {
        stop: "Stansted Airport Coach Station",
        time: "06:15",
        dep: true
      }, {
        stop: "Golders Green Finchley Road Stop GV",
        time: "07:25"
      }, {
        stop: "Finchley Road Train Station Stop FF",
        time: "07:36"
      }, {
        stop: "Finchley Road Tube Station Stop CH",
        time: "07:37"
      }, {
        stop: "St John's Wood Lord's Stop K",
        time: "07:41"
      }, {
        stop: "Baker Street Stop A",
        time: "07:45"
      }, {
        stop: "Paddington Station Stop 15",
        time: "07:51",
        arr: true
      }]
    }, {
      title: "Trip 3 — Paddington → Stansted",
      stops: [{
        stop: "Paddington Station Stop 15",
        time: "07:55",
        dep: true
      }, {
        stop: "Baker Street Marylebone Rd Stop V",
        time: "08:05"
      }, {
        stop: "St John's Wood Lord's Stop Z",
        time: "08:10"
      }, {
        stop: "Finchley Road Tube Station Stop CL",
        time: "08:17"
      }, {
        stop: "Finchley Road Train Station Stop FD",
        time: "08:20"
      }, {
        stop: "Golders Green Bus Station Stop GE",
        time: "08:35"
      }, {
        stop: "Stansted Airport Coach Station",
        time: "09:50",
        arr: true
      }]
    }, {
      title: "Trip 4 — Stansted → Paddington",
      stops: [{
        stop: "Pull on stand",
        time: "11:00"
      }, {
        stop: "Stansted Airport Coach Station",
        time: "11:10",
        dep: true
      }, {
        stop: "Golders Green Bus Station Stop GE",
        time: "12:20"
      }, {
        stop: "Finchley Road Train Station Stop FF",
        time: "12:31"
      }, {
        stop: "Finchley Road Tube Station Stop CH",
        time: "12:32"
      }, {
        stop: "St John's Wood Lord's Stop K",
        time: "12:40"
      }, {
        stop: "Baker Street Stop A",
        time: "12:45"
      }, {
        stop: "Paddington Station Stop 15",
        time: "12:51",
        arr: true,
        notes: "Hand over Coach 1 to Duty 266"
      }]
    }, {
      title: "Return to Depot",
      stops: [{
        stop: "Travel on Tube back to Depot",
        time: "13:02",
        notes: "Tube departs 13:02"
      }, {
        stop: "Sign Off",
        time: "13:40"
      }]
    }]
  },
  202: {
    number: 202,
    days: "Monday to Friday",
    route: "Route A6 — Stansted Airport",
    signOn: "02:10",
    signOff: "14:40",
    dutyLength: "12:30",
    coach: "Coach 2",
    reminders: ["Ensure you have a 45 minute break", "Record travel movement as other work on tachograph", "When on a motorway you are in control of your excess speed"],
    tubeInfo: "Tube departs at 14:02",
    segments: [{
      title: "Preparation",
      stops: [{
        stop: "Sign On — Walk round check Coach 2",
        time: "02:10"
      }, {
        stop: "Empty to Paddington Station",
        time: "02:30"
      }, {
        stop: "Arrive for loading",
        time: "03:30"
      }]
    }, {
      title: "Trip 1 — Paddington → Stansted",
      stops: [{
        stop: "Paddington Station Stop 15",
        time: "03:35",
        dep: true
      }, {
        stop: "Baker Street Marylebone Rd Stop V",
        time: "03:43"
      }, {
        stop: "St John's Wood Lord's Stop Z",
        time: "03:48"
      }, {
        stop: "Finchley Road Tube Station Stop CL",
        time: "03:53"
      }, {
        stop: "Finchley Road Train Station Stop FD",
        time: "03:56"
      }, {
        stop: "Golders Green Bus Station Stop GE",
        time: "04:09"
      }, {
        stop: "Stansted Airport Coach Station",
        time: "05:20",
        arr: true
      }]
    }, {
      title: "Trip 2 — Stansted → Paddington",
      stops: [{
        stop: "Pull on stand",
        time: "06:45"
      }, {
        stop: "Stansted Airport Coach Station",
        time: "06:55",
        dep: true
      }, {
        stop: "Golders Green Finchley Road Stop GV",
        time: "08:20"
      }, {
        stop: "Finchley Road Train Station Stop FF",
        time: "08:31"
      }, {
        stop: "Finchley Road Tube Station Stop CH",
        time: "08:32"
      }, {
        stop: "St John's Wood Lord's Stop K",
        time: "08:40"
      }, {
        stop: "Baker Street Stop A",
        time: "08:45"
      }, {
        stop: "Paddington Station Stop 15",
        time: "08:51",
        arr: true
      }]
    }, {
      title: "Trip 3 — Paddington → Stansted",
      stops: [{
        stop: "Paddington Station Stop 15",
        time: "08:55",
        dep: true
      }, {
        stop: "Baker Street Marylebone Rd Stop V",
        time: "09:05"
      }, {
        stop: "St John's Wood Lord's Stop Z",
        time: "09:10"
      }, {
        stop: "Finchley Road Tube Station Stop CL",
        time: "09:17"
      }, {
        stop: "Finchley Road Train Station Stop FD",
        time: "09:20"
      }, {
        stop: "Golders Green Bus Station Stop GE",
        time: "09:35"
      }, {
        stop: "Stansted Airport Coach Station",
        time: "10:50",
        arr: true
      }]
    }, {
      title: "Trip 4 — Stansted → Paddington",
      stops: [{
        stop: "Pull on stand",
        time: "12:00"
      }, {
        stop: "Stansted Airport Coach Station",
        time: "12:10",
        dep: true
      }, {
        stop: "Golders Green Bus Station Stop GE",
        time: "13:20"
      }, {
        stop: "Finchley Road Train Station Stop FF",
        time: "13:31"
      }, {
        stop: "Finchley Road Tube Station Stop CH",
        time: "13:32"
      }, {
        stop: "St John's Wood Lord's Stop K",
        time: "13:40"
      }, {
        stop: "Baker Street Stop A",
        time: "13:45"
      }, {
        stop: "Paddington Station Stop 15",
        time: "13:51",
        arr: true,
        notes: "Hand over Coach 2 to Duty 207"
      }]
    }, {
      title: "Return to Depot",
      stops: [{
        stop: "Travel on Tube back to Depot",
        time: "14:02",
        notes: "Tube departs 14:02"
      }, {
        stop: "Sign Off",
        time: "14:40"
      }]
    }]
  },
  262: {
    number: 262,
    days: "Saturday & Sunday",
    route: "Route A6 — Stansted Airport",
    signOn: "02:10",
    signOff: "14:40",
    dutyLength: "12:30",
    coach: "Coach 2",
    reminders: ["Ensure you have a 45 minute break", "Record travel movement as other work on tachograph", "When on a motorway you are in control of your excess speed"],
    tubeInfo: "Tube departs at 14:02",
    segments: [{
      title: "Preparation",
      stops: [{
        stop: "Sign On — Walk round check Coach 2",
        time: "02:10"
      }, {
        stop: "Empty to Paddington Station",
        time: "02:30"
      }, {
        stop: "Arrive for loading",
        time: "03:30"
      }]
    }, {
      title: "Trip 1 — Paddington → Stansted",
      stops: [{
        stop: "Paddington Station Stop 15",
        time: "03:35",
        dep: true
      }, {
        stop: "Baker Street Marylebone Rd Stop V",
        time: "03:43"
      }, {
        stop: "St John's Wood Lord's Stop Z",
        time: "03:48"
      }, {
        stop: "Finchley Road Tube Station Stop CL",
        time: "03:53"
      }, {
        stop: "Finchley Road Train Station Stop FD",
        time: "03:56"
      }, {
        stop: "Golders Green Bus Station Stop GE",
        time: "04:09"
      }, {
        stop: "Stansted Airport Coach Station",
        time: "05:20",
        arr: true
      }]
    }, {
      title: "Trip 2 — Stansted → Paddington",
      stops: [{
        stop: "Pull on stand",
        time: "07:00"
      }, {
        stop: "Stansted Airport Coach Station",
        time: "07:10",
        dep: true
      }, {
        stop: "Golders Green Finchley Road Stop GV",
        time: "08:20"
      }, {
        stop: "Finchley Road Train Station Stop FF",
        time: "08:31"
      }, {
        stop: "Finchley Road Tube Station Stop CH",
        time: "08:32"
      }, {
        stop: "St John's Wood Lord's Stop K",
        time: "08:40"
      }, {
        stop: "Baker Street Stop A",
        time: "08:45"
      }, {
        stop: "Paddington Station Stop 15",
        time: "08:51",
        arr: true
      }]
    }, {
      title: "Trip 3 — Paddington → Stansted",
      stops: [{
        stop: "Paddington Station Stop 15",
        time: "08:55",
        dep: true
      }, {
        stop: "Baker Street Marylebone Rd Stop V",
        time: "09:05"
      }, {
        stop: "St John's Wood Lord's Stop Z",
        time: "09:10"
      }, {
        stop: "Finchley Road Tube Station Stop CL",
        time: "09:17"
      }, {
        stop: "Finchley Road Train Station Stop FD",
        time: "09:20"
      }, {
        stop: "Golders Green Bus Station Stop GE",
        time: "09:35"
      }, {
        stop: "Stansted Airport Coach Station",
        time: "10:50",
        arr: true
      }]
    }, {
      title: "Trip 4 — Stansted → Paddington",
      stops: [{
        stop: "Pull on stand",
        time: "12:00"
      }, {
        stop: "Stansted Airport Coach Station",
        time: "12:10",
        dep: true
      }, {
        stop: "Golders Green Bus Station Stop GE",
        time: "13:20"
      }, {
        stop: "Finchley Road Train Station Stop FF",
        time: "13:31"
      }, {
        stop: "Finchley Road Tube Station Stop CH",
        time: "13:32"
      }, {
        stop: "St John's Wood Lord's Stop K",
        time: "13:40"
      }, {
        stop: "Baker Street Stop A",
        time: "13:45"
      }, {
        stop: "Paddington Station Stop 15",
        time: "13:51",
        arr: true,
        notes: "Hand over Coach 2 to Duty 267"
      }]
    }, {
      title: "Return to Depot",
      stops: [{
        stop: "Travel on Tube back to Depot",
        time: "14:02",
        notes: "Tube departs 14:02"
      }, {
        stop: "Sign Off",
        time: "14:40"
      }]
    }]
  },
  203: {
    number: 203,
    days: "Monday to Friday",
    route: "Route A6 — Stansted Airport",
    signOn: "03:00",
    signOff: "15:40",
    dutyLength: "12:40",
    coach: "Coach 3",
    reminders: ["Ensure you have a 45 minute break", "Record travel movement as other work on tachograph", "When on a motorway you are in control of your excess speed"],
    tubeInfo: "Tube departs at 15:02",
    segments: [{
      title: "Preparation",
      stops: [{
        stop: "Sign On — Walk round check Coach 3",
        time: "03:00"
      }, {
        stop: "Empty to Paddington Station",
        time: "03:20"
      }, {
        stop: "Arrive for loading",
        time: "04:20"
      }]
    }, {
      title: "Trip 1 — Paddington → Stansted",
      stops: [{
        stop: "Paddington Station Stop 15",
        time: "04:25",
        dep: true
      }, {
        stop: "Baker Street Marylebone Rd Stop V",
        time: "04:33"
      }, {
        stop: "St John's Wood Lord's Stop Z",
        time: "04:38"
      }, {
        stop: "Finchley Road Tube Station Stop CL",
        time: "04:43"
      }, {
        stop: "Finchley Road Train Station Stop FD",
        time: "04:46"
      }, {
        stop: "Golders Green Bus Station Stop GE",
        time: "04:59"
      }, {
        stop: "Stansted Airport Coach Station",
        time: "06:10",
        arr: true
      }]
    }, {
      title: "Trip 2 — Stansted → Paddington",
      stops: [{
        stop: "Pull on stand",
        time: "07:45"
      }, {
        stop: "Stansted Airport Coach Station",
        time: "07:55",
        dep: true
      }, {
        stop: "Golders Green Finchley Road Stop GV",
        time: "09:20"
      }, {
        stop: "Finchley Road Train Station Stop FF",
        time: "09:31"
      }, {
        stop: "Finchley Road Tube Station Stop CH",
        time: "09:32"
      }, {
        stop: "St John's Wood Lord's Stop K",
        time: "09:40"
      }, {
        stop: "Baker Street Stop A",
        time: "09:45"
      }, {
        stop: "Paddington Station Stop 15",
        time: "09:51",
        arr: true
      }]
    }, {
      title: "Trip 3 — Paddington → Stansted",
      stops: [{
        stop: "Paddington Station Stop 15",
        time: "09:55",
        dep: true
      }, {
        stop: "Baker Street Marylebone Rd Stop V",
        time: "10:05"
      }, {
        stop: "St John's Wood Lord's Stop Z",
        time: "10:10"
      }, {
        stop: "Finchley Road Tube Station Stop CL",
        time: "10:17"
      }, {
        stop: "Finchley Road Train Station Stop FD",
        time: "10:20"
      }, {
        stop: "Golders Green Bus Station Stop GE",
        time: "10:35"
      }, {
        stop: "Stansted Airport Coach Station",
        time: "11:50",
        arr: true
      }]
    }, {
      title: "Trip 4 — Stansted → Paddington",
      stops: [{
        stop: "Pull on stand",
        time: "13:00"
      }, {
        stop: "Stansted Airport Coach Station",
        time: "13:10",
        dep: true
      }, {
        stop: "Golders Green Bus Station Stop GE",
        time: "14:20"
      }, {
        stop: "Finchley Road Train Station Stop FF",
        time: "14:31"
      }, {
        stop: "Finchley Road Tube Station Stop CH",
        time: "14:32"
      }, {
        stop: "St John's Wood Lord's Stop K",
        time: "14:40"
      }, {
        stop: "Baker Street Stop A",
        time: "14:45"
      }, {
        stop: "Paddington Station Stop 15",
        time: "14:51",
        arr: true,
        notes: "Hand over Coach 3 to Duty 208"
      }]
    }, {
      title: "Return to Depot",
      stops: [{
        stop: "Travel on Tube back to Depot",
        time: "15:02",
        notes: "Tube departs 15:02"
      }, {
        stop: "Sign Off",
        time: "15:40"
      }]
    }]
  },
  263: {
    number: 263,
    days: "Saturday & Sunday",
    route: "Route A6 — Stansted Airport",
    signOn: "03:00",
    signOff: "15:40",
    dutyLength: "12:40",
    coach: "Coach 3",
    reminders: ["Ensure you have a 45 minute break", "Record travel movement as other work on tachograph", "When on a motorway you are in control of your excess speed"],
    tubeInfo: "Tube departs at 15:02",
    segments: [{
      title: "Preparation",
      stops: [{
        stop: "Sign On — Walk round check Coach 3",
        time: "03:00"
      }, {
        stop: "Empty to Paddington Station",
        time: "03:20"
      }, {
        stop: "Arrive for loading",
        time: "04:20"
      }]
    }, {
      title: "Trip 1 — Paddington → Stansted",
      stops: [{
        stop: "Paddington Station Stop 15",
        time: "04:25",
        dep: true
      }, {
        stop: "Baker Street Marylebone Rd Stop V",
        time: "04:33"
      }, {
        stop: "St John's Wood Lord's Stop Z",
        time: "04:38"
      }, {
        stop: "Finchley Road Tube Station Stop CL",
        time: "04:43"
      }, {
        stop: "Finchley Road Train Station Stop FD",
        time: "04:46"
      }, {
        stop: "Golders Green Bus Station Stop GE",
        time: "04:59"
      }, {
        stop: "Stansted Airport Coach Station",
        time: "06:10",
        arr: true
      }]
    }, {
      title: "Trip 2 — Stansted → Paddington",
      stops: [{
        stop: "Pull on stand",
        time: "08:00"
      }, {
        stop: "Stansted Airport Coach Station",
        time: "08:10",
        dep: true
      }, {
        stop: "Golders Green Finchley Road Stop GV",
        time: "09:20"
      }, {
        stop: "Finchley Road Train Station Stop FF",
        time: "09:31"
      }, {
        stop: "Finchley Road Tube Station Stop CH",
        time: "09:32"
      }, {
        stop: "St John's Wood Lord's Stop K",
        time: "09:40"
      }, {
        stop: "Baker Street Stop A",
        time: "09:45"
      }, {
        stop: "Paddington Station Stop 15",
        time: "09:51",
        arr: true
      }]
    }, {
      title: "Trip 3 — Paddington → Stansted",
      stops: [{
        stop: "Paddington Station Stop 15",
        time: "09:55",
        dep: true
      }, {
        stop: "Baker Street Marylebone Rd Stop V",
        time: "10:05"
      }, {
        stop: "St John's Wood Lord's Stop Z",
        time: "10:10"
      }, {
        stop: "Finchley Road Tube Station Stop CL",
        time: "10:17"
      }, {
        stop: "Finchley Road Train Station Stop FD",
        time: "10:20"
      }, {
        stop: "Golders Green Bus Station Stop GE",
        time: "10:35"
      }, {
        stop: "Stansted Airport Coach Station",
        time: "11:50",
        arr: true
      }]
    }, {
      title: "Trip 4 — Stansted → Paddington",
      stops: [{
        stop: "Pull on stand",
        time: "13:00"
      }, {
        stop: "Stansted Airport Coach Station",
        time: "13:10",
        dep: true
      }, {
        stop: "Golders Green Bus Station Stop GE",
        time: "14:20"
      }, {
        stop: "Finchley Road Train Station Stop FF",
        time: "14:31"
      }, {
        stop: "Finchley Road Tube Station Stop CH",
        time: "14:32"
      }, {
        stop: "St John's Wood Lord's Stop K",
        time: "14:40"
      }, {
        stop: "Baker Street Stop A",
        time: "14:45"
      }, {
        stop: "Paddington Station Stop 15",
        time: "14:51",
        arr: true,
        notes: "Hand over Coach 3 to Duty 268"
      }]
    }, {
      title: "Return to Depot",
      stops: [{
        stop: "Travel on Tube back to Depot",
        time: "15:02",
        notes: "Tube departs 15:02"
      }, {
        stop: "Sign Off",
        time: "15:40"
      }]
    }]
  },
  204: {
    number: 204,
    days: "Monday to Friday",
    route: "Route A6 — Stansted Airport",
    signOn: "04:00",
    signOff: "16:40",
    dutyLength: "12:40",
    coach: "Coach 4",
    reminders: ["Ensure you have a 45 minute break", "Record travel movement as other work on tachograph", "When on a motorway you are in control of your excess speed"],
    tubeInfo: "Tube departs at 16:02",
    segments: [{
      title: "Preparation",
      stops: [{
        stop: "Sign On — Walk round check Coach 4",
        time: "04:00"
      }, {
        stop: "Empty to Paddington Station",
        time: "04:20"
      }, {
        stop: "Arrive for loading",
        time: "05:20"
      }]
    }, {
      title: "Trip 1 — Paddington → Stansted",
      stops: [{
        stop: "Paddington Station Stop 15",
        time: "05:25",
        dep: true
      }, {
        stop: "Baker Street Marylebone Rd Stop V",
        time: "05:33"
      }, {
        stop: "St John's Wood Lord's Stop Z",
        time: "05:38"
      }, {
        stop: "Finchley Road Tube Station Stop CL",
        time: "05:43"
      }, {
        stop: "Finchley Road Train Station Stop FD",
        time: "05:46"
      }, {
        stop: "Golders Green Bus Station Stop GE",
        time: "05:59"
      }, {
        stop: "Stansted Airport Coach Station",
        time: "07:10",
        arr: true
      }]
    }, {
      title: "Trip 2 — Stansted → Paddington",
      stops: [{
        stop: "Pull on stand",
        time: "08:50"
      }, {
        stop: "Stansted Airport Coach Station",
        time: "09:00",
        dep: true
      }, {
        stop: "Golders Green Finchley Road Stop GV",
        time: "10:20"
      }, {
        stop: "Finchley Road Train Station Stop FF",
        time: "10:31"
      }, {
        stop: "Finchley Road Tube Station Stop CH",
        time: "10:32"
      }, {
        stop: "St John's Wood Lord's Stop K",
        time: "10:40"
      }, {
        stop: "Baker Street Stop A",
        time: "10:45"
      }, {
        stop: "Paddington Station Stop 15",
        time: "10:51",
        arr: true
      }]
    }, {
      title: "Trip 3 — Paddington → Stansted",
      stops: [{
        stop: "Paddington Station Stop 15",
        time: "10:55",
        dep: true
      }, {
        stop: "Baker Street Marylebone Rd Stop V",
        time: "11:05"
      }, {
        stop: "St John's Wood Lord's Stop Z",
        time: "11:10"
      }, {
        stop: "Finchley Road Tube Station Stop CL",
        time: "11:17"
      }, {
        stop: "Finchley Road Train Station Stop FD",
        time: "11:20"
      }, {
        stop: "Golders Green Bus Station Stop GE",
        time: "11:35"
      }, {
        stop: "Stansted Airport Coach Station",
        time: "12:50",
        arr: true
      }]
    }, {
      title: "Trip 4 — Stansted → Paddington",
      stops: [{
        stop: "Pull on stand",
        time: "14:00"
      }, {
        stop: "Stansted Airport Coach Station",
        time: "14:10",
        dep: true
      }, {
        stop: "Golders Green Bus Station Stop GE",
        time: "15:20"
      }, {
        stop: "Finchley Road Train Station Stop FF",
        time: "15:31"
      }, {
        stop: "Finchley Road Tube Station Stop CH",
        time: "15:32"
      }, {
        stop: "St John's Wood Lord's Stop K",
        time: "15:40"
      }, {
        stop: "Baker Street Stop A",
        time: "15:45"
      }, {
        stop: "Paddington Station Stop 15",
        time: "15:51",
        arr: true,
        notes: "Hand over Coach 4 to Duty 209"
      }]
    }, {
      title: "Return to Depot",
      stops: [{
        stop: "Travel on Tube back to Depot",
        time: "16:02",
        notes: "Tube departs 16:02"
      }, {
        stop: "Sign Off",
        time: "16:40"
      }]
    }]
  },
  264: {
    number: 264,
    days: "Saturday & Sunday",
    route: "Route A6 — Stansted Airport",
    signOn: "04:00",
    signOff: "16:40",
    dutyLength: "12:40",
    coach: "Coach 4",
    reminders: ["Ensure you have a 45 minute break", "Record travel movement as other work on tachograph", "When on a motorway you are in control of your excess speed"],
    tubeInfo: "Tube departs at 16:02",
    segments: [{
      title: "Preparation",
      stops: [{
        stop: "Sign On — Walk round check Coach 4",
        time: "04:00"
      }, {
        stop: "Empty to Paddington Station",
        time: "04:20"
      }, {
        stop: "Arrive for loading",
        time: "05:20"
      }]
    }, {
      title: "Trip 1 — Paddington → Stansted",
      stops: [{
        stop: "Paddington Station Stop 15",
        time: "05:25",
        dep: true
      }, {
        stop: "Baker Street Marylebone Rd Stop V",
        time: "05:33"
      }, {
        stop: "St John's Wood Lord's Stop Z",
        time: "05:38"
      }, {
        stop: "Finchley Road Tube Station Stop CL",
        time: "05:43"
      }, {
        stop: "Finchley Road Train Station Stop FD",
        time: "05:46"
      }, {
        stop: "Golders Green Bus Station Stop GE",
        time: "05:59"
      }, {
        stop: "Stansted Airport Coach Station",
        time: "07:10",
        arr: true
      }]
    }, {
      title: "Trip 2 — Stansted → Paddington",
      stops: [{
        stop: "Pull on stand",
        time: "09:00"
      }, {
        stop: "Stansted Airport Coach Station",
        time: "09:10",
        dep: true
      }, {
        stop: "Golders Green Finchley Road Stop GV",
        time: "10:20"
      }, {
        stop: "Finchley Road Train Station Stop FF",
        time: "10:31"
      }, {
        stop: "Finchley Road Tube Station Stop CH",
        time: "10:32"
      }, {
        stop: "St John's Wood Lord's Stop K",
        time: "10:40"
      }, {
        stop: "Baker Street Stop A",
        time: "10:45"
      }, {
        stop: "Paddington Station Stop 15",
        time: "10:51",
        arr: true
      }]
    }, {
      title: "Trip 3 — Paddington → Stansted",
      stops: [{
        stop: "Paddington Station Stop 15",
        time: "10:55",
        dep: true
      }, {
        stop: "Baker Street Marylebone Rd Stop V",
        time: "11:05"
      }, {
        stop: "St John's Wood Lord's Stop Z",
        time: "11:10"
      }, {
        stop: "Finchley Road Tube Station Stop CL",
        time: "11:17"
      }, {
        stop: "Finchley Road Train Station Stop FD",
        time: "11:20"
      }, {
        stop: "Golders Green Bus Station Stop GE",
        time: "11:35"
      }, {
        stop: "Stansted Airport Coach Station",
        time: "12:50",
        arr: true
      }]
    }, {
      title: "Trip 4 — Stansted → Paddington",
      stops: [{
        stop: "Pull on stand",
        time: "14:00"
      }, {
        stop: "Stansted Airport Coach Station",
        time: "14:10",
        dep: true
      }, {
        stop: "Golders Green Bus Station Stop GE",
        time: "15:20"
      }, {
        stop: "Finchley Road Train Station Stop FF",
        time: "15:31"
      }, {
        stop: "Finchley Road Tube Station Stop CH",
        time: "15:32"
      }, {
        stop: "St John's Wood Lord's Stop K",
        time: "15:40"
      }, {
        stop: "Baker Street Stop A",
        time: "15:45"
      }, {
        stop: "Paddington Station Stop 15",
        time: "15:51",
        arr: true,
        notes: "Hand over Coach 4 to Duty 269"
      }]
    }, {
      title: "Return to Depot",
      stops: [{
        stop: "Travel on Tube back to Depot",
        time: "16:02",
        notes: "Tube departs 16:02"
      }, {
        stop: "Sign Off",
        time: "16:40"
      }]
    }]
  },
  205: {
    number: 205,
    days: "Daily",
    route: "Route A6 — Stansted Airport",
    signOn: "05:00",
    signOff: "17:40",
    dutyLength: "12:40",
    coach: "Coach 5",
    reminders: ["Ensure you have a 45 minute break", "Record travel movement as other work on tachograph", "When on a motorway you are in control of your excess speed"],
    tubeInfo: "Tube departs at 17:02",
    segments: [{
      title: "Preparation",
      stops: [{
        stop: "Sign On — Walk round check Coach 5",
        time: "05:00"
      }, {
        stop: "Empty to Paddington Station",
        time: "05:20"
      }, {
        stop: "Arrive for loading",
        time: "06:20"
      }]
    }, {
      title: "Trip 1 — Paddington → Stansted",
      stops: [{
        stop: "Paddington Station Stop 15",
        time: "06:25",
        dep: true
      }, {
        stop: "Baker Street Marylebone Rd Stop V",
        time: "06:33"
      }, {
        stop: "St John's Wood Lord's Stop Z",
        time: "06:38"
      }, {
        stop: "Finchley Road Tube Station Stop CL",
        time: "06:45"
      }, {
        stop: "Finchley Road Train Station Stop FD",
        time: "06:48"
      }, {
        stop: "Golders Green Bus Station Stop GE",
        time: "07:03"
      }, {
        stop: "Stansted Airport Coach Station",
        time: "08:20",
        arr: true
      }]
    }, {
      title: "Trip 2 — Stansted → Paddington",
      stops: [{
        stop: "Pull on stand",
        time: "10:00"
      }, {
        stop: "Stansted Airport Coach Station",
        time: "10:10",
        dep: true
      }, {
        stop: "Golders Green Finchley Road Stop GV",
        time: "11:20"
      }, {
        stop: "Finchley Road Train Station Stop FF",
        time: "11:31"
      }, {
        stop: "Finchley Road Tube Station Stop CH",
        time: "11:32"
      }, {
        stop: "St John's Wood Lord's Stop K",
        time: "11:40"
      }, {
        stop: "Baker Street Stop A",
        time: "11:45"
      }, {
        stop: "Paddington Station Stop 15",
        time: "11:51",
        arr: true
      }]
    }, {
      title: "Trip 3 — Paddington → Stansted",
      stops: [{
        stop: "Paddington Station Stop 15",
        time: "11:55",
        dep: true
      }, {
        stop: "Baker Street Marylebone Rd Stop V",
        time: "12:05"
      }, {
        stop: "St John's Wood Lord's Stop Z",
        time: "12:10"
      }, {
        stop: "Finchley Road Tube Station Stop CL",
        time: "12:17"
      }, {
        stop: "Finchley Road Train Station Stop FD",
        time: "12:20"
      }, {
        stop: "Golders Green Bus Station Stop GE",
        time: "12:35"
      }, {
        stop: "Stansted Airport Coach Station",
        time: "13:50",
        arr: true
      }]
    }, {
      title: "Trip 4 — Stansted → Paddington",
      stops: [{
        stop: "Pull on stand",
        time: "15:00"
      }, {
        stop: "Stansted Airport Coach Station",
        time: "15:10",
        dep: true
      }, {
        stop: "Golders Green Bus Station Stop GE",
        time: "16:20"
      }, {
        stop: "Finchley Road Train Station Stop FF",
        time: "16:31"
      }, {
        stop: "Finchley Road Tube Station Stop CH",
        time: "16:32"
      }, {
        stop: "St John's Wood Lord's Stop K",
        time: "16:40"
      }, {
        stop: "Baker Street Stop A",
        time: "16:45"
      }, {
        stop: "Paddington Station Stop 15",
        time: "16:51",
        arr: true,
        notes: "Hand over Coach 5 to Duty 210"
      }]
    }, {
      title: "Return to Depot",
      stops: [{
        stop: "Travel on Tube back to Depot",
        time: "17:02",
        notes: "Tube departs 17:02"
      }, {
        stop: "Sign Off",
        time: "17:40"
      }]
    }]
  },
  // ── A6 LATE DUTIES (206-210, 266-270) ─────────────────────
  206: {
    number: 206,
    days: "Monday to Friday",
    route: "Route A6 — Stansted Airport",
    signOn: "12:05",
    signOff: "23:45",
    dutyLength: "11:40",
    coach: "Coach 1",
    reminders: ["Ensure you have a 45 minute break", "Record travel movement as other work on tachograph", "When on a motorway you are in control of your excess speed"],
    tubeInfo: "Tube departs at 12:14",
    segments: [{
      title: "Travel to Paddington",
      stops: [{
        stop: "Sign On",
        time: "12:05"
      }, {
        stop: "Travel on Tube to Paddington Station",
        time: "12:14",
        notes: "Tube departs 12:14"
      }]
    }, {
      title: "Trip 1 — Paddington → Stansted",
      stops: [{
        stop: "Take over Coach 1 from Duty 201",
        time: "12:51",
        notes: "Takeover"
      }, {
        stop: "Paddington Station Stop J",
        time: "12:55",
        dep: true
      }, {
        stop: "Baker Street Gloucester Place Stop 19",
        time: "13:05"
      }, {
        stop: "St John's Wood Lord's Stop Z",
        time: "13:10"
      }, {
        stop: "Finchley Road Tube Station Stop CL",
        time: "13:17"
      }, {
        stop: "Finchley Road Train Station Stop FD",
        time: "13:20"
      }, {
        stop: "Golders Green Bus Station Stop GE",
        time: "13:35"
      }, {
        stop: "Stansted Airport Coach Station",
        time: "14:50",
        arr: true
      }]
    }, {
      title: "Trip 2 — Stansted → Paddington",
      stops: [{
        stop: "Pull on stand",
        time: "16:00"
      }, {
        stop: "Stansted Airport Coach Station",
        time: "16:10",
        dep: true
      }, {
        stop: "Golders Green Finchley Road Stop GV",
        time: "17:20"
      }, {
        stop: "Finchley Road Train Station Stop FF",
        time: "17:31"
      }, {
        stop: "Finchley Road Tube Station Stop CH",
        time: "17:32"
      }, {
        stop: "St John's Wood Lord's Stop K",
        time: "17:40"
      }, {
        stop: "Baker Street Stop A",
        time: "17:45"
      }, {
        stop: "Paddington Station Stop J",
        time: "17:51",
        arr: true
      }]
    }, {
      title: "Trip 3 — Paddington → Stansted",
      stops: [{
        stop: "Paddington Station Stop J",
        time: "17:55",
        dep: true
      }, {
        stop: "Baker Street Gloucester Place Stop 19",
        time: "18:05"
      }, {
        stop: "St John's Wood Lord's Stop Z",
        time: "18:11"
      }, {
        stop: "Finchley Road Tube Station Stop CL",
        time: "18:19"
      }, {
        stop: "Finchley Road Train Station Stop FD",
        time: "18:22"
      }, {
        stop: "Golders Green Bus Station Stop GE",
        time: "18:40"
      }, {
        stop: "Stansted Airport Coach Station",
        time: "20:10",
        arr: true
      }]
    }, {
      title: "Trip 4 — Stansted → Paddington",
      stops: [{
        stop: "Pull on stand",
        time: "21:15"
      }, {
        stop: "Stansted Airport Coach Station",
        time: "21:25",
        dep: true
      }, {
        stop: "Golders Green Finchley Road Stop GV",
        time: "22:30"
      }, {
        stop: "Finchley Road Train Station Stop FF",
        time: "22:40"
      }, {
        stop: "Finchley Road Tube Station Stop CH",
        time: "22:41"
      }, {
        stop: "St John's Wood Lord's Stop K",
        time: "22:46"
      }, {
        stop: "Baker Street Stop A",
        time: "22:50"
      }, {
        stop: "Paddington Station Stop J",
        time: "22:55",
        arr: true
      }]
    }, {
      title: "Return to Depot",
      stops: [{
        stop: "Empty to Depot",
        time: "22:55"
      }, {
        stop: "Sign Off",
        time: "23:45"
      }]
    }]
  },
  266: {
    number: 266,
    days: "Saturday & Sunday",
    route: "Route A6 — Stansted Airport",
    signOn: "12:05",
    signOff: "23:45",
    dutyLength: "11:40",
    coach: "Coach 1",
    reminders: ["Ensure you have a 45 minute break", "Record travel movement as other work on tachograph", "When on a motorway you are in control of your excess speed"],
    tubeInfo: "Tube departs at 12:14",
    segments: [{
      title: "Travel to Paddington",
      stops: [{
        stop: "Sign On",
        time: "12:05"
      }, {
        stop: "Travel on Tube to Paddington Station",
        time: "12:14",
        notes: "Tube departs 12:14"
      }]
    }, {
      title: "Trip 1 — Paddington → Stansted",
      stops: [{
        stop: "Take over Coach 1 from Duty 261",
        time: "12:51",
        notes: "Takeover"
      }, {
        stop: "Paddington Station Stop J",
        time: "12:55",
        dep: true
      }, {
        stop: "Baker Street Gloucester Place Stop 19",
        time: "13:05"
      }, {
        stop: "St John's Wood Lord's Stop Z",
        time: "13:10"
      }, {
        stop: "Finchley Road Tube Station Stop CL",
        time: "13:17"
      }, {
        stop: "Finchley Road Train Station Stop FD",
        time: "13:20"
      }, {
        stop: "Golders Green Bus Station Stop GE",
        time: "13:35"
      }, {
        stop: "Stansted Airport Coach Station",
        time: "14:50",
        arr: true
      }]
    }, {
      title: "Trip 2 — Stansted → Paddington",
      stops: [{
        stop: "Pull on stand",
        time: "16:00"
      }, {
        stop: "Stansted Airport Coach Station",
        time: "16:10",
        dep: true
      }, {
        stop: "Golders Green Finchley Road Stop GV",
        time: "17:20"
      }, {
        stop: "Finchley Road Train Station Stop FF",
        time: "17:31"
      }, {
        stop: "Finchley Road Tube Station Stop CH",
        time: "17:32"
      }, {
        stop: "St John's Wood Lord's Stop K",
        time: "17:40"
      }, {
        stop: "Baker Street Stop A",
        time: "17:45"
      }, {
        stop: "Paddington Station Stop J",
        time: "17:51",
        arr: true
      }]
    }, {
      title: "Trip 3 — Paddington → Stansted",
      stops: [{
        stop: "Paddington Station Stop J",
        time: "17:55",
        dep: true
      }, {
        stop: "Baker Street Gloucester Place Stop 19",
        time: "18:05"
      }, {
        stop: "St John's Wood Lord's Stop Z",
        time: "18:10"
      }, {
        stop: "Finchley Road Tube Station Stop CL",
        time: "18:17"
      }, {
        stop: "Finchley Road Train Station Stop FD",
        time: "18:20"
      }, {
        stop: "Golders Green Bus Station Stop GE",
        time: "18:35"
      }, {
        stop: "Stansted Airport Coach Station",
        time: "19:50",
        arr: true
      }]
    }, {
      title: "Trip 4 — Stansted → Paddington",
      stops: [{
        stop: "Pull on stand",
        time: "21:15"
      }, {
        stop: "Stansted Airport Coach Station",
        time: "21:25",
        dep: true
      }, {
        stop: "Golders Green Finchley Road Stop GV",
        time: "22:30"
      }, {
        stop: "Finchley Road Train Station Stop FF",
        time: "22:40"
      }, {
        stop: "Finchley Road Tube Station Stop CH",
        time: "22:41"
      }, {
        stop: "St John's Wood Lord's Stop K",
        time: "22:46"
      }, {
        stop: "Baker Street Stop A",
        time: "22:50"
      }, {
        stop: "Paddington Station Stop J",
        time: "22:55",
        arr: true
      }]
    }, {
      title: "Return to Depot",
      stops: [{
        stop: "Empty to Depot",
        time: "22:55"
      }, {
        stop: "Sign Off",
        time: "23:45"
      }]
    }]
  },
  207: {
    number: 207,
    days: "Monday to Friday",
    route: "Route A6 — Stansted Airport",
    signOn: "13:05",
    signOff: "00:45",
    dutyLength: "11:40",
    coach: "Coach 2",
    reminders: ["Ensure you have a 45 minute break", "Record travel movement as other work on tachograph", "When on a motorway you are in control of your excess speed"],
    tubeInfo: "Tube departs at 13:14",
    segments: [{
      title: "Travel to Paddington",
      stops: [{
        stop: "Sign On",
        time: "13:05"
      }, {
        stop: "Travel on Tube to Paddington Station",
        time: "13:14",
        notes: "Tube departs 13:14"
      }]
    }, {
      title: "Trip 1 — Paddington → Stansted",
      stops: [{
        stop: "Take over Coach 2 from Duty 202",
        time: "13:51",
        notes: "Takeover"
      }, {
        stop: "Paddington Station Stop J",
        time: "13:55",
        dep: true
      }, {
        stop: "Baker Street Gloucester Place Stop 19",
        time: "14:05"
      }, {
        stop: "St John's Wood Lord's Stop Z",
        time: "14:10"
      }, {
        stop: "Finchley Road Tube Station Stop CL",
        time: "14:17"
      }, {
        stop: "Finchley Road Train Station Stop FD",
        time: "14:20"
      }, {
        stop: "Golders Green Bus Station Stop GE",
        time: "14:35"
      }, {
        stop: "Stansted Airport Coach Station",
        time: "16:00",
        arr: true
      }]
    }, {
      title: "Trip 2 — Stansted → Paddington",
      stops: [{
        stop: "Pull on stand",
        time: "17:05"
      }, {
        stop: "Stansted Airport Coach Station",
        time: "17:15",
        dep: true
      }, {
        stop: "Golders Green Finchley Road Stop GV",
        time: "18:25"
      }, {
        stop: "Finchley Road Train Station Stop FF",
        time: "18:36"
      }, {
        stop: "Finchley Road Tube Station Stop CH",
        time: "18:37"
      }, {
        stop: "St John's Wood Lord's Stop K",
        time: "18:45"
      }, {
        stop: "Baker Street Stop A",
        time: "18:50"
      }, {
        stop: "Paddington Station Stop J",
        time: "18:56",
        arr: true
      }]
    }, {
      title: "Trip 3 — Paddington → Stansted",
      stops: [{
        stop: "Paddington Station Stop J",
        time: "19:00",
        dep: true
      }, {
        stop: "Baker Street Gloucester Place Stop 19",
        time: "19:08"
      }, {
        stop: "St John's Wood Lord's Stop Z",
        time: "19:13"
      }, {
        stop: "Finchley Road Tube Station Stop CL",
        time: "19:21"
      }, {
        stop: "Finchley Road Train Station Stop FD",
        time: "19:24"
      }, {
        stop: "Golders Green Bus Station Stop GE",
        time: "19:42"
      }, {
        stop: "Stansted Airport Coach Station",
        time: "21:10",
        arr: true
      }]
    }, {
      title: "Trip 4 — Stansted → Paddington",
      stops: [{
        stop: "Pull on stand",
        time: "22:15"
      }, {
        stop: "Stansted Airport Coach Station",
        time: "22:25",
        dep: true
      }, {
        stop: "Golders Green Bus Station Stop GE",
        time: "23:30"
      }, {
        stop: "Finchley Road Train Station Stop FF",
        time: "23:40"
      }, {
        stop: "Finchley Road Tube Station Stop CH",
        time: "23:41"
      }, {
        stop: "St John's Wood Lord's Stop K",
        time: "23:46"
      }, {
        stop: "Baker Street Stop A",
        time: "23:50"
      }, {
        stop: "Paddington Station Stop J",
        time: "23:55",
        arr: true
      }]
    }, {
      title: "Return to Depot",
      stops: [{
        stop: "Empty to Depot",
        time: "23:55"
      }, {
        stop: "Sign Off",
        time: "00:45"
      }]
    }]
  },
  267: {
    number: 267,
    days: "Saturday & Sunday",
    route: "Route A6 — Stansted Airport",
    signOn: "13:05",
    signOff: "00:45",
    dutyLength: "11:40",
    coach: "Coach 2",
    reminders: ["Ensure you have a 45 minute break", "Record travel movement as other work on tachograph", "When on a motorway you are in control of your excess speed"],
    tubeInfo: "Tube departs at 13:14",
    segments: [{
      title: "Travel to Paddington",
      stops: [{
        stop: "Sign On",
        time: "13:05"
      }, {
        stop: "Travel on Tube to Paddington Station",
        time: "13:14"
      }]
    }, {
      title: "Trip 1 — Paddington → Stansted",
      stops: [{
        stop: "Take over Coach 2 from Duty 262",
        time: "13:51",
        notes: "Takeover"
      }, {
        stop: "Paddington Station Stop J",
        time: "13:55",
        dep: true
      }, {
        stop: "Baker Street Gloucester Place Stop 19",
        time: "14:05"
      }, {
        stop: "St John's Wood Lord's Stop Z",
        time: "14:10"
      }, {
        stop: "Finchley Road Tube Station Stop CL",
        time: "14:17"
      }, {
        stop: "Finchley Road Train Station Stop FD",
        time: "14:20"
      }, {
        stop: "Golders Green Bus Station Stop GE",
        time: "14:35"
      }, {
        stop: "Stansted Airport Coach Station",
        time: "15:50",
        arr: true
      }]
    }, {
      title: "Trip 2 — Stansted → Paddington",
      stops: [{
        stop: "Pull on stand",
        time: "17:05"
      }, {
        stop: "Stansted Airport Coach Station",
        time: "17:15",
        dep: true
      }, {
        stop: "Golders Green Finchley Road Stop GV",
        time: "18:25"
      }, {
        stop: "Finchley Road Train Station Stop FF",
        time: "18:36"
      }, {
        stop: "Finchley Road Tube Station Stop CH",
        time: "18:37"
      }, {
        stop: "St John's Wood Lord's Stop K",
        time: "18:45"
      }, {
        stop: "Baker Street Stop A",
        time: "18:50"
      }, {
        stop: "Paddington Station Stop J",
        time: "18:56",
        arr: true
      }]
    }, {
      title: "Trip 3 — Paddington → Stansted",
      stops: [{
        stop: "Paddington Station Stop J",
        time: "19:00",
        dep: true
      }, {
        stop: "Baker Street Gloucester Place Stop 19",
        time: "19:08"
      }, {
        stop: "St John's Wood Lord's Stop Z",
        time: "19:13"
      }, {
        stop: "Finchley Road Tube Station Stop CL",
        time: "19:20"
      }, {
        stop: "Finchley Road Train Station Stop FD",
        time: "19:23"
      }, {
        stop: "Golders Green Bus Station Stop GE",
        time: "19:38"
      }, {
        stop: "Stansted Airport Coach Station",
        time: "20:55",
        arr: true
      }]
    }, {
      title: "Trip 4 — Stansted → Paddington",
      stops: [{
        stop: "Pull on stand",
        time: "22:15"
      }, {
        stop: "Stansted Airport Coach Station",
        time: "22:25",
        dep: true
      }, {
        stop: "Golders Green Bus Station Stop GE",
        time: "23:30"
      }, {
        stop: "Finchley Road Train Station Stop FF",
        time: "23:40"
      }, {
        stop: "Finchley Road Tube Station Stop CH",
        time: "23:41"
      }, {
        stop: "St John's Wood Lord's Stop K",
        time: "23:46"
      }, {
        stop: "Baker Street Stop A",
        time: "23:50"
      }, {
        stop: "Paddington Station Stop J",
        time: "23:55",
        arr: true
      }]
    }, {
      title: "Return to Depot",
      stops: [{
        stop: "Empty to Depot",
        time: "23:55"
      }, {
        stop: "Sign Off",
        time: "00:45"
      }]
    }]
  },
  208: {
    number: 208,
    days: "Monday to Friday",
    route: "Route A6 — Stansted Airport",
    signOn: "14:05",
    signOff: "01:55",
    dutyLength: "11:50",
    coach: "Coach 3",
    reminders: ["Ensure you have a 45 minute break", "Record travel movement as other work on tachograph", "When on a motorway you are in control of your excess speed"],
    tubeInfo: "Tube departs at 14:14",
    segments: [{
      title: "Travel to Paddington",
      stops: [{
        stop: "Sign On",
        time: "14:05"
      }, {
        stop: "Travel on Tube to Paddington Station",
        time: "14:14"
      }]
    }, {
      title: "Trip 1 — Paddington → Stansted",
      stops: [{
        stop: "Take over Coach 3 from Duty 203",
        time: "14:51",
        notes: "Takeover"
      }, {
        stop: "Paddington Station Stop J",
        time: "14:55",
        dep: true
      }, {
        stop: "Baker Street Gloucester Place Stop 19",
        time: "15:05"
      }, {
        stop: "St John's Wood Lord's Stop Z",
        time: "15:10"
      }, {
        stop: "Finchley Road Tube Station Stop CL",
        time: "15:17"
      }, {
        stop: "Finchley Road Train Station Stop FD",
        time: "15:20"
      }, {
        stop: "Golders Green Bus Station Stop GE",
        time: "15:35"
      }, {
        stop: "Stansted Airport Coach Station",
        time: "17:05",
        arr: true
      }]
    }, {
      title: "Trip 2 — Stansted → Paddington",
      stops: [{
        stop: "Pull on stand",
        time: "18:10"
      }, {
        stop: "Stansted Airport Coach Station",
        time: "18:20",
        dep: true
      }, {
        stop: "Golders Green Finchley Road Stop GV",
        time: "19:25"
      }, {
        stop: "Finchley Road Train Station Stop FF",
        time: "19:37"
      }, {
        stop: "Finchley Road Tube Station Stop CH",
        time: "19:38"
      }, {
        stop: "St John's Wood Lord's Stop K",
        time: "19:45"
      }, {
        stop: "Baker Street Stop A",
        time: "19:50"
      }, {
        stop: "Paddington Station Stop J",
        time: "19:56",
        arr: true
      }]
    }, {
      title: "Trip 3 — Paddington → Stansted",
      stops: [{
        stop: "Paddington Station Stop J",
        time: "20:00",
        dep: true
      }, {
        stop: "Baker Street Gloucester Place Stop 19",
        time: "20:08"
      }, {
        stop: "St John's Wood Lord's Stop Z",
        time: "20:13"
      }, {
        stop: "Finchley Road Tube Station Stop CL",
        time: "20:18"
      }, {
        stop: "Finchley Road Train Station Stop FD",
        time: "20:21"
      }, {
        stop: "Golders Green Bus Station Stop GE",
        time: "20:36"
      }, {
        stop: "Stansted Airport Coach Station",
        time: "21:50",
        arr: true
      }]
    }, {
      title: "Trip 4 — Stansted → Paddington",
      stops: [{
        stop: "Pull on stand",
        time: "23:25"
      }, {
        stop: "Stansted Airport Coach Station",
        time: "23:35",
        dep: true
      }, {
        stop: "Golders Green Bus Station Stop GE",
        time: "00:40"
      }, {
        stop: "Finchley Road Train Station Stop FF",
        time: "00:50"
      }, {
        stop: "Finchley Road Tube Station Stop CH",
        time: "00:51"
      }, {
        stop: "St John's Wood Lord's Stop K",
        time: "00:56"
      }, {
        stop: "Baker Street Stop A",
        time: "01:00"
      }, {
        stop: "Paddington Station Stop J",
        time: "01:05",
        arr: true
      }]
    }, {
      title: "Return to Depot",
      stops: [{
        stop: "Empty to Depot",
        time: "01:05"
      }, {
        stop: "Sign Off",
        time: "01:55"
      }]
    }]
  },
  268: {
    number: 268,
    days: "Saturday & Sunday",
    route: "Route A6 — Stansted Airport",
    signOn: "14:05",
    signOff: "01:55",
    dutyLength: "11:50",
    coach: "Coach 3",
    reminders: ["Ensure you have a 45 minute break", "Record travel movement as other work on tachograph", "When on a motorway you are in control of your excess speed"],
    tubeInfo: "Tube departs at 14:14",
    segments: [{
      title: "Travel to Paddington",
      stops: [{
        stop: "Sign On",
        time: "14:05"
      }, {
        stop: "Travel on Tube to Paddington Station",
        time: "14:14"
      }]
    }, {
      title: "Trip 1 — Paddington → Stansted",
      stops: [{
        stop: "Take over Coach 3 from Duty 263",
        time: "14:51",
        notes: "Takeover"
      }, {
        stop: "Paddington Station Stop J",
        time: "14:55",
        dep: true
      }, {
        stop: "Baker Street Gloucester Place Stop 19",
        time: "15:05"
      }, {
        stop: "St John's Wood Lord's Stop Z",
        time: "15:10"
      }, {
        stop: "Finchley Road Tube Station Stop CL",
        time: "15:17"
      }, {
        stop: "Finchley Road Train Station Stop FD",
        time: "15:20"
      }, {
        stop: "Golders Green Bus Station Stop GE",
        time: "15:35"
      }, {
        stop: "Stansted Airport Coach Station",
        time: "16:50",
        arr: true
      }]
    }, {
      title: "Trip 2 — Stansted → Paddington",
      stops: [{
        stop: "Pull on stand",
        time: "18:10"
      }, {
        stop: "Stansted Airport Coach Station",
        time: "18:20",
        dep: true
      }, {
        stop: "Golders Green Finchley Road Stop GV",
        time: "19:25"
      }, {
        stop: "Finchley Road Train Station Stop FF",
        time: "19:37"
      }, {
        stop: "Finchley Road Tube Station Stop CH",
        time: "19:38"
      }, {
        stop: "St John's Wood Lord's Stop K",
        time: "19:45"
      }, {
        stop: "Baker Street Stop A",
        time: "19:50"
      }, {
        stop: "Paddington Station Stop J",
        time: "19:56",
        arr: true
      }]
    }, {
      title: "Trip 3 — Paddington → Stansted",
      stops: [{
        stop: "Paddington Station Stop J",
        time: "20:00",
        dep: true
      }, {
        stop: "Baker Street Gloucester Place Stop 19",
        time: "20:08"
      }, {
        stop: "St John's Wood Lord's Stop Z",
        time: "20:13"
      }, {
        stop: "Finchley Road Tube Station Stop CL",
        time: "20:18"
      }, {
        stop: "Finchley Road Train Station Stop FD",
        time: "20:21"
      }, {
        stop: "Golders Green Bus Station Stop GE",
        time: "20:36"
      }, {
        stop: "Stansted Airport Coach Station",
        time: "21:50",
        arr: true
      }]
    }, {
      title: "Trip 4 — Stansted → Paddington",
      stops: [{
        stop: "Pull on stand",
        time: "23:25"
      }, {
        stop: "Stansted Airport Coach Station",
        time: "23:35",
        dep: true
      }, {
        stop: "Golders Green Bus Station Stop GE",
        time: "00:40"
      }, {
        stop: "Finchley Road Train Station Stop FF",
        time: "00:50"
      }, {
        stop: "Finchley Road Tube Station Stop CH",
        time: "00:51"
      }, {
        stop: "St John's Wood Lord's Stop K",
        time: "00:56"
      }, {
        stop: "Baker Street Stop A",
        time: "01:00"
      }, {
        stop: "Paddington Station Stop J",
        time: "01:05",
        arr: true
      }]
    }, {
      title: "Return to Depot",
      stops: [{
        stop: "Empty to Depot",
        time: "01:05"
      }, {
        stop: "Sign Off",
        time: "01:55"
      }]
    }]
  },
  209: {
    number: 209,
    days: "Monday to Friday",
    route: "Route A6 — Stansted Airport",
    signOn: "15:05",
    signOff: "03:15",
    dutyLength: "12:10",
    coach: "Coach 4",
    reminders: ["Ensure you have a 45 minute break", "Record travel movement as other work on tachograph", "When on a motorway you are in control of your excess speed"],
    tubeInfo: "Tube departs at 15:14",
    segments: [{
      title: "Travel to Paddington",
      stops: [{
        stop: "Sign On",
        time: "15:05"
      }, {
        stop: "Travel on Tube to Paddington Station",
        time: "15:14"
      }]
    }, {
      title: "Trip 1 — Paddington → Stansted",
      stops: [{
        stop: "Take over Coach 4 from Duty 204",
        time: "15:51",
        notes: "Takeover"
      }, {
        stop: "Paddington Station Stop J",
        time: "15:55",
        dep: true
      }, {
        stop: "Baker Street Gloucester Place Stop 19",
        time: "16:05"
      }, {
        stop: "St John's Wood Lord's Stop Z",
        time: "16:11"
      }, {
        stop: "Finchley Road Tube Station Stop CL",
        time: "16:19"
      }, {
        stop: "Finchley Road Train Station Stop FD",
        time: "16:22"
      }, {
        stop: "Golders Green Bus Station Stop GE",
        time: "16:40"
      }, {
        stop: "Stansted Airport Coach Station",
        time: "18:10",
        arr: true
      }]
    }, {
      title: "Trip 2 — Stansted → Paddington",
      stops: [{
        stop: "Pull on stand",
        time: "19:15"
      }, {
        stop: "Stansted Airport Coach Station",
        time: "19:25",
        dep: true
      }, {
        stop: "Golders Green Finchley Road Stop GV",
        time: "20:30"
      }, {
        stop: "Finchley Road Train Station Stop FF",
        time: "20:40"
      }, {
        stop: "Finchley Road Tube Station Stop CH",
        time: "20:41"
      }, {
        stop: "St John's Wood Lord's Stop K",
        time: "20:46"
      }, {
        stop: "Baker Street Stop A",
        time: "20:51"
      }, {
        stop: "Paddington Station Stop J",
        time: "20:56",
        arr: true
      }]
    }, {
      title: "Trip 3 — Paddington → Stansted",
      stops: [{
        stop: "Paddington Station Stop J",
        time: "21:00",
        dep: true
      }, {
        stop: "Baker Street Gloucester Place Stop 19",
        time: "21:08"
      }, {
        stop: "St John's Wood Lord's Stop Z",
        time: "21:13"
      }, {
        stop: "Finchley Road Tube Station Stop CL",
        time: "21:18"
      }, {
        stop: "Finchley Road Train Station Stop FD",
        time: "21:21"
      }, {
        stop: "Golders Green Bus Station Stop GE",
        time: "21:34"
      }, {
        stop: "Stansted Airport Coach Station",
        time: "22:40",
        arr: true
      }]
    }, {
      title: "Trip 4 — Stansted → Paddington",
      stops: [{
        stop: "Pull on stand",
        time: "00:45"
      }, {
        stop: "Stansted Airport Coach Station",
        time: "00:55",
        dep: true
      }, {
        stop: "Golders Green Bus Station Stop GE",
        time: "02:00"
      }, {
        stop: "Finchley Road Train Station Stop FF",
        time: "02:10"
      }, {
        stop: "Finchley Road Tube Station Stop CH",
        time: "02:11"
      }, {
        stop: "St John's Wood Lord's Stop K",
        time: "02:16"
      }, {
        stop: "Baker Street Stop A",
        time: "02:20"
      }, {
        stop: "Paddington Station Stop J",
        time: "02:25",
        arr: true
      }]
    }, {
      title: "Return to Depot",
      stops: [{
        stop: "Empty to Depot",
        time: "02:25"
      }, {
        stop: "Sign Off",
        time: "03:15"
      }]
    }]
  },
  269: {
    number: 269,
    days: "Saturday & Sunday",
    route: "Route A6 — Stansted Airport",
    signOn: "15:05",
    signOff: "03:15",
    dutyLength: "12:10",
    coach: "Coach 4",
    reminders: ["Ensure you have a 45 minute break", "Record travel movement as other work on tachograph", "When on a motorway you are in control of your excess speed"],
    tubeInfo: "Tube departs at 15:14",
    segments: [{
      title: "Travel to Paddington",
      stops: [{
        stop: "Sign On",
        time: "15:05"
      }, {
        stop: "Travel on Tube to Paddington Station",
        time: "15:14"
      }]
    }, {
      title: "Trip 1 — Paddington → Stansted",
      stops: [{
        stop: "Take over Coach 4 from Duty 264",
        time: "15:51",
        notes: "Takeover"
      }, {
        stop: "Paddington Station Stop J",
        time: "15:55",
        dep: true
      }, {
        stop: "Baker Street Gloucester Place Stop 19",
        time: "16:05"
      }, {
        stop: "St John's Wood Lord's Stop Z",
        time: "16:10"
      }, {
        stop: "Finchley Road Tube Station Stop CL",
        time: "16:17"
      }, {
        stop: "Finchley Road Train Station Stop FD",
        time: "16:20"
      }, {
        stop: "Golders Green Bus Station Stop GE",
        time: "16:35"
      }, {
        stop: "Stansted Airport Coach Station",
        time: "17:50",
        arr: true
      }]
    }, {
      title: "Trip 2 — Stansted → Paddington",
      stops: [{
        stop: "Pull on stand",
        time: "19:15"
      }, {
        stop: "Stansted Airport Coach Station",
        time: "19:25",
        dep: true
      }, {
        stop: "Golders Green Finchley Road Stop GV",
        time: "20:30"
      }, {
        stop: "Finchley Road Train Station Stop FF",
        time: "20:40"
      }, {
        stop: "Finchley Road Tube Station Stop CH",
        time: "20:41"
      }, {
        stop: "St John's Wood Lord's Stop K",
        time: "20:45"
      }, {
        stop: "Baker Street Stop A",
        time: "20:51"
      }, {
        stop: "Paddington Station Stop J",
        time: "20:56",
        arr: true
      }]
    }, {
      title: "Trip 3 — Paddington → Stansted",
      stops: [{
        stop: "Paddington Station Stop J",
        time: "21:00",
        dep: true
      }, {
        stop: "Baker Street Gloucester Place Stop 19",
        time: "21:08"
      }, {
        stop: "St John's Wood Lord's Stop Z",
        time: "21:13"
      }, {
        stop: "Finchley Road Tube Station Stop CL",
        time: "21:18"
      }, {
        stop: "Finchley Road Train Station Stop FD",
        time: "21:21"
      }, {
        stop: "Golders Green Bus Station Stop GE",
        time: "21:34"
      }, {
        stop: "Stansted Airport Coach Station",
        time: "22:40",
        arr: true
      }]
    }, {
      title: "Trip 4 — Stansted → Paddington",
      stops: [{
        stop: "Pull on stand",
        time: "00:45"
      }, {
        stop: "Stansted Airport Coach Station",
        time: "00:55",
        dep: true
      }, {
        stop: "Golders Green Bus Station Stop GE",
        time: "02:00"
      }, {
        stop: "Finchley Road Train Station Stop FF",
        time: "02:10"
      }, {
        stop: "Finchley Road Tube Station Stop CH",
        time: "02:11"
      }, {
        stop: "St John's Wood Lord's Stop K",
        time: "02:16"
      }, {
        stop: "Baker Street Stop A",
        time: "02:20"
      }, {
        stop: "Paddington Station Stop J",
        time: "02:25",
        arr: true
      }]
    }, {
      title: "Return to Depot",
      stops: [{
        stop: "Empty to Depot",
        time: "02:25"
      }, {
        stop: "Sign Off",
        time: "03:15"
      }]
    }]
  },
  210: {
    number: 210,
    days: "Monday to Friday",
    route: "Route A6 — Stansted Airport",
    signOn: "16:05",
    signOff: "03:35",
    dutyLength: "11:30",
    coach: "Coach 5",
    reminders: ["Ensure you have a 45 minute break", "Record travel movement as other work on tachograph", "When on a motorway you are in control of your excess speed"],
    tubeInfo: "Tube departs at 16:14",
    segments: [{
      title: "Travel to Paddington",
      stops: [{
        stop: "Sign On",
        time: "16:05"
      }, {
        stop: "Travel on Tube to Paddington Station",
        time: "16:14"
      }]
    }, {
      title: "Trip 1 — Paddington → Stansted",
      stops: [{
        stop: "Take over Coach 5 from Duty 205",
        time: "16:51",
        notes: "Takeover"
      }, {
        stop: "Paddington Station Stop J",
        time: "16:55",
        dep: true
      }, {
        stop: "Baker Street Gloucester Place Stop 19",
        time: "17:05"
      }, {
        stop: "St John's Wood Lord's Stop Z",
        time: "17:11"
      }, {
        stop: "Finchley Road Tube Station Stop CL",
        time: "17:19"
      }, {
        stop: "Finchley Road Train Station Stop FD",
        time: "17:22"
      }, {
        stop: "Golders Green Bus Station Stop GE",
        time: "17:40"
      }, {
        stop: "Stansted Airport Coach Station",
        time: "19:10",
        arr: true
      }]
    }, {
      title: "Trip 2 — Stansted → Paddington",
      stops: [{
        stop: "Pull on stand",
        time: "20:15"
      }, {
        stop: "Stansted Airport Coach Station",
        time: "20:25",
        dep: true
      }, {
        stop: "Golders Green Finchley Road Stop GV",
        time: "21:30"
      }, {
        stop: "Finchley Road Train Station Stop FF",
        time: "21:40"
      }, {
        stop: "Finchley Road Tube Station Stop CH",
        time: "21:41"
      }, {
        stop: "St John's Wood Lord's Stop K",
        time: "21:46"
      }, {
        stop: "Baker Street Stop A",
        time: "21:50"
      }, {
        stop: "Paddington Station Stop J",
        time: "21:55",
        arr: true
      }]
    }, {
      title: "Trip 3 — Paddington → Stansted",
      stops: [{
        stop: "Paddington Station Stop J",
        time: "21:55",
        dep: true
      }, {
        stop: "Baker Street Gloucester Place Stop 19",
        time: "22:03"
      }, {
        stop: "St John's Wood Lord's Stop Z",
        time: "22:08"
      }, {
        stop: "Finchley Road Tube Station Stop CL",
        time: "22:13"
      }, {
        stop: "Finchley Road Train Station Stop FD",
        time: "22:16"
      }, {
        stop: "Golders Green Bus Station Stop GE",
        time: "22:29"
      }, {
        stop: "Stansted Airport Coach Station",
        time: "23:35",
        arr: true
      }]
    }, {
      title: "Trip 4 — Stansted → Paddington",
      stops: [{
        stop: "Pull on stand",
        time: "01:05"
      }, {
        stop: "Stansted Airport Coach Station",
        time: "01:15",
        dep: true
      }, {
        stop: "Golders Green Bus Station Stop GE",
        time: "02:20"
      }, {
        stop: "Finchley Road Train Station Stop FF",
        time: "02:30"
      }, {
        stop: "Finchley Road Tube Station Stop CH",
        time: "02:31"
      }, {
        stop: "St John's Wood Lord's Stop K",
        time: "02:36"
      }, {
        stop: "Baker Street Stop A",
        time: "02:40"
      }, {
        stop: "Paddington Station Stop J",
        time: "02:45",
        arr: true
      }]
    }, {
      title: "Return to Depot",
      stops: [{
        stop: "Empty to Depot",
        time: "02:45"
      }, {
        stop: "Sign Off",
        time: "03:35"
      }]
    }]
  },
  270: {
    number: 270,
    days: "Saturday & Sunday",
    route: "Route A6 — Stansted Airport",
    signOn: "16:05",
    signOff: "03:35",
    dutyLength: "11:30",
    coach: "Coach 5",
    reminders: ["Ensure you have a 45 minute break", "Record travel movement as other work on tachograph", "When on a motorway you are in control of your excess speed"],
    tubeInfo: "Tube departs at 16:14",
    segments: [{
      title: "Travel to Paddington",
      stops: [{
        stop: "Sign On",
        time: "16:05"
      }, {
        stop: "Travel on Tube to Paddington Station",
        time: "16:14"
      }]
    }, {
      title: "Trip 1 — Paddington → Stansted",
      stops: [{
        stop: "Take over Coach 5 from Duty 205",
        time: "16:51",
        notes: "Takeover"
      }, {
        stop: "Paddington Station Stop J",
        time: "16:55",
        dep: true
      }, {
        stop: "Baker Street Gloucester Place Stop 19",
        time: "17:05"
      }, {
        stop: "St John's Wood Lord's Stop Z",
        time: "17:10"
      }, {
        stop: "Finchley Road Tube Station Stop CL",
        time: "17:17"
      }, {
        stop: "Finchley Road Train Station Stop FD",
        time: "17:20"
      }, {
        stop: "Golders Green Bus Station Stop GE",
        time: "17:35"
      }, {
        stop: "Stansted Airport Coach Station",
        time: "18:50",
        arr: true
      }]
    }, {
      title: "Trip 2 — Stansted → Paddington",
      stops: [{
        stop: "Pull on stand",
        time: "20:15"
      }, {
        stop: "Stansted Airport Coach Station",
        time: "20:25",
        dep: true
      }, {
        stop: "Golders Green Finchley Road Stop GV",
        time: "21:30"
      }, {
        stop: "Finchley Road Train Station Stop FF",
        time: "21:40"
      }, {
        stop: "Finchley Road Tube Station Stop CH",
        time: "21:41"
      }, {
        stop: "St John's Wood Lord's Stop K",
        time: "21:46"
      }, {
        stop: "Baker Street Stop A",
        time: "21:50"
      }, {
        stop: "Paddington Station Stop J",
        time: "21:55",
        arr: true
      }]
    }, {
      title: "Trip 3 — Paddington → Stansted",
      stops: [{
        stop: "Paddington Station Stop J",
        time: "21:55",
        dep: true
      }, {
        stop: "Baker Street Gloucester Place Stop 19",
        time: "22:03"
      }, {
        stop: "St John's Wood Lord's Stop Z",
        time: "22:08"
      }, {
        stop: "Finchley Road Tube Station Stop CL",
        time: "22:13"
      }, {
        stop: "Finchley Road Train Station Stop FD",
        time: "22:16"
      }, {
        stop: "Golders Green Bus Station Stop GE",
        time: "22:29"
      }, {
        stop: "Stansted Airport Coach Station",
        time: "23:35",
        arr: true
      }]
    }, {
      title: "Trip 4 — Stansted → Paddington",
      stops: [{
        stop: "Pull on stand",
        time: "01:05"
      }, {
        stop: "Stansted Airport Coach Station",
        time: "01:15",
        dep: true
      }, {
        stop: "Golders Green Bus Station Stop GE",
        time: "02:20"
      }, {
        stop: "Finchley Road Train Station Stop FF",
        time: "02:30"
      }, {
        stop: "Finchley Road Tube Station Stop CH",
        time: "02:31"
      }, {
        stop: "St John's Wood Lord's Stop K",
        time: "02:36"
      }, {
        stop: "Baker Street Stop A",
        time: "02:40"
      }, {
        stop: "Paddington Station Stop J",
        time: "02:45",
        arr: true
      }]
    }, {
      title: "Return to Depot",
      stops: [{
        stop: "Empty to Depot",
        time: "02:45"
      }, {
        stop: "Sign Off",
        time: "03:35"
      }]
    }]
  },
  // ── NETWORK EARLY DUTIES (300 series) ─────────────────────
  301: {
    number: 301,
    days: "Daily",
    route: "Route 025 — Brighton",
    signOn: "03:30",
    signOff: "15:10",
    dutyLength: "11:40",
    coach: "Coach 6",
    reminders: ["Ensure you have a 45 minute break", "Record travel movement as other work on tachograph", "When on a motorway you are in control of your excess speed"],
    tubeInfo: "Elizabeth Line departs at 14:32",
    segments: [{
      title: "Preparation",
      stops: [{
        stop: "Sign On — Walk round check Coach 6",
        time: "03:30"
      }, {
        stop: "Empty to Victoria Coach Station",
        time: "03:50"
      }, {
        stop: "Arrive for loading",
        time: "04:50"
      }]
    }, {
      title: "Trip 1 — Victoria → Heathrow → Gatwick → Brighton",
      stops: [{
        stop: "Victoria Coach Station departures",
        time: "05:00",
        dep: true
      }, {
        stop: "Heathrow Central Bus Station",
        time: "05:50"
      }, {
        stop: "Heathrow Terminal 5",
        time: "06:05"
      }, {
        stop: "Gatwick North Terminal",
        time: "07:00"
      }, {
        stop: "Gatwick South Terminal",
        time: "07:10"
      }, {
        stop: "Hickstead Bus Stop",
        time: "07:35"
      }, {
        stop: "Patcham Black Lion",
        time: "07:43"
      }, {
        stop: "Withdean Park The Deneway",
        time: "07:45"
      }, {
        stop: "Preston Park Hotel",
        time: "07:47"
      }, {
        stop: "Preston Circus London Road",
        time: "07:50"
      }, {
        stop: "York Place St Peters Church",
        time: "07:55"
      }, {
        stop: "Brighton Pool Valley",
        time: "08:05",
        arr: true
      }]
    }, {
      title: "Trip 2 — Brighton → Gatwick → Heathrow → Victoria",
      stops: [{
        stop: "Brighton Pool Valley",
        time: "10:05",
        dep: true
      }, {
        stop: "Preston Circus Carters",
        time: "10:12"
      }, {
        stop: "Preston Park Sainsburys",
        time: "10:15"
      }, {
        stop: "Withdean Park The Deneway",
        time: "10:17"
      }, {
        stop: "Patcham Black Lion",
        time: "10:19"
      }, {
        stop: "Hickstead Bus Stop",
        time: "10:29"
      }, {
        stop: "Gatwick South Terminal",
        time: "10:50"
      }, {
        stop: "Gatwick North Terminal",
        time: "11:05"
      }, {
        stop: "Heathrow Terminal 5",
        time: "12:05"
      }, {
        stop: "Heathrow Central Bus Station",
        time: "12:20"
      }, {
        stop: "Victoria Coach Station arrivals",
        time: "13:30",
        arr: true
      }]
    }, {
      title: "Handover & Return",
      stops: [{
        stop: "Empty to Departures — Hand over Coach 6 to Duty 306",
        time: "13:40"
      }, {
        stop: "Travel on Tube back to Depot",
        time: "14:32",
        notes: "Elizabeth Line 14:32"
      }, {
        stop: "Sign Off",
        time: "15:10"
      }]
    }]
  },
  302: {
    number: 302,
    days: "Monday to Friday",
    route: "Route 400 — Birmingham",
    signOn: "04:30",
    signOff: "15:10",
    dutyLength: "10:40",
    coach: "Coach 7",
    reminders: ["Ensure you have a 45 minute break", "Record travel movement as other work on tachograph", "When on a motorway you are in control of your excess speed"],
    tubeInfo: "Elizabeth Line departs at 14:32",
    segments: [{
      title: "Preparation",
      stops: [{
        stop: "Sign On — Walk round check Coach 7",
        time: "04:30"
      }, {
        stop: "Empty to Victoria Coach Station",
        time: "04:50"
      }, {
        stop: "Arrive for loading",
        time: "05:50"
      }]
    }, {
      title: "Trip 1 — Victoria → Coventry → Birmingham",
      stops: [{
        stop: "Victoria Coach Station departures",
        time: "06:00",
        dep: true
      }, {
        stop: "Coventry Pool Meadow Bus Station",
        time: "08:15",
        arr: true
      }]
    }, {
      title: "Trip 1 continues — Coventry → Birmingham",
      stops: [{
        stop: "Coventry Pool Meadow Bus Station",
        time: "08:20",
        dep: true
      }, {
        stop: "Birmingham Digbeth",
        time: "09:10",
        arr: true
      }]
    }, {
      title: "Trip 2 — Birmingham → Victoria",
      stops: [{
        stop: "Birmingham Digbeth",
        time: "10:15",
        dep: true
      }, {
        stop: "Golders Green Bus Station Stop GE",
        time: "12:30"
      }, {
        stop: "Marble Arch Park Lane",
        time: "13:05"
      }, {
        stop: "Victoria Coach Station arrivals",
        time: "13:20",
        arr: true
      }]
    }, {
      title: "Handover & Return",
      stops: [{
        stop: "Hand over Coach 7 to Duty 307",
        time: "13:40"
      }, {
        stop: "Travel on Tube back to Depot",
        time: "14:32",
        notes: "Elizabeth Line 14:32"
      }, {
        stop: "Sign Off",
        time: "15:10"
      }]
    }]
  },
  362: {
    number: 362,
    days: "Saturday & Sunday",
    route: "Route 400 — Birmingham",
    signOn: "04:30",
    signOff: "15:10",
    dutyLength: "10:40",
    coach: "Coach 7",
    reminders: ["Ensure you have a 45 minute break", "Record travel movement as other work on tachograph", "When on a motorway you are in control of your excess speed"],
    tubeInfo: "Elizabeth Line departs at 14:32",
    segments: [{
      title: "Preparation",
      stops: [{
        stop: "Sign On — Walk round check Coach 7",
        time: "04:30"
      }, {
        stop: "Empty to Victoria Coach Station",
        time: "04:50"
      }, {
        stop: "Arrive for loading",
        time: "05:50"
      }]
    }, {
      title: "Trip 1 — Victoria → Coventry → Birmingham",
      stops: [{
        stop: "Victoria Coach Station departures",
        time: "06:00",
        dep: true
      }, {
        stop: "Coventry Pool Meadow Bus Station",
        time: "08:10",
        arr: true
      }]
    }, {
      title: "Trip 1 continues — Coventry → Birmingham",
      stops: [{
        stop: "Coventry Pool Meadow Bus Station",
        time: "08:15",
        dep: true
      }, {
        stop: "Birmingham Digbeth",
        time: "08:55",
        arr: true
      }]
    }, {
      title: "Trip 2 — Birmingham → Victoria",
      stops: [{
        stop: "Birmingham Digbeth",
        time: "10:15",
        dep: true
      }, {
        stop: "Golders Green Bus Station Stop GE",
        time: "12:30"
      }, {
        stop: "Marble Arch Park Lane",
        time: "13:05"
      }, {
        stop: "Victoria Coach Station arrivals",
        time: "13:20",
        arr: true
      }]
    }, {
      title: "Handover & Return",
      stops: [{
        stop: "Hand over Coach 7 to Duty 367",
        time: "13:40"
      }, {
        stop: "Travel on Tube back to Depot",
        time: "14:32",
        notes: "Elizabeth Line 14:32"
      }, {
        stop: "Sign Off",
        time: "15:10"
      }]
    }]
  },
  303: {
    number: 303,
    days: "Friday & Monday",
    route: "Route 450 — Nottingham",
    signOn: "04:50",
    signOff: "16:10",
    dutyLength: "11:20",
    coach: "Coach 9",
    reminders: ["Ensure you have a 45 minute break", "Record travel movement as other work on tachograph", "When on a motorway you are in control of your excess speed"],
    tubeInfo: "Elizabeth Line departs at 15:32",
    segments: [{
      title: "Preparation",
      stops: [{
        stop: "Sign On — Walk round check Coach 9",
        time: "04:50"
      }, {
        stop: "Empty to Victoria Coach Station",
        time: "05:10"
      }, {
        stop: "Arrive for loading",
        time: "06:20"
      }]
    }, {
      title: "Trip 1 — Victoria → Milton Keynes → Leicester → Nottingham",
      stops: [{
        stop: "Victoria Coach Station departures",
        time: "06:30",
        dep: true
      }, {
        stop: "Milton Keynes Coachway",
        time: "07:50"
      }, {
        stop: "Leicester St Margaret's Bus Station",
        time: "09:15",
        arr: true
      }]
    }, {
      title: "Trip 1 continues — Leicester → Nottingham",
      stops: [{
        stop: "Leicester St Margaret's Bus Station",
        time: "09:20",
        dep: true
      }, {
        stop: "Nottingham Broad Marsh Bus Station",
        time: "10:15",
        arr: true
      }]
    }, {
      title: "Trip 2 — Nottingham → Victoria",
      stops: [{
        stop: "Nottingham Broad Marsh Bus Station",
        time: "11:30",
        dep: true
      }, {
        stop: "Nottingham University University Boulevard",
        time: "11:40"
      }, {
        stop: "Golders Green Bus Station Stop GE",
        time: "14:00"
      }, {
        stop: "Marble Arch Park Lane",
        time: "14:35"
      }, {
        stop: "Victoria Coach Station arrivals",
        time: "14:50",
        arr: true
      }]
    }, {
      title: "Handover & Return",
      stops: [{
        stop: "Hand over Coach 9 to Duty 308",
        time: "15:00"
      }, {
        stop: "Travel on Tube back to Depot",
        time: "15:32",
        notes: "Elizabeth Line 15:32"
      }, {
        stop: "Sign Off",
        time: "16:10"
      }]
    }]
  },
  323: {
    number: 323,
    days: "Tuesday to Thursday",
    route: "Route 450 — Nottingham",
    signOn: "04:50",
    signOff: "16:10",
    dutyLength: "11:20",
    coach: "Coach 9",
    reminders: ["Ensure you have a 45 minute break", "Record travel movement as other work on tachograph", "When on a motorway you are in control of your excess speed"],
    tubeInfo: "Elizabeth Line departs at 15:32",
    segments: [{
      title: "Preparation",
      stops: [{
        stop: "Sign On — Walk round check Coach 9",
        time: "04:50"
      }, {
        stop: "Empty to Victoria Coach Station",
        time: "05:10"
      }, {
        stop: "Arrive for loading",
        time: "06:20"
      }]
    }, {
      title: "Trip 1 — Victoria → Milton Keynes → Leicester → Nottingham",
      stops: [{
        stop: "Victoria Coach Station departures",
        time: "06:30",
        dep: true
      }, {
        stop: "Milton Keynes Coachway",
        time: "07:50"
      }, {
        stop: "Leicester St Margaret's Bus Station",
        time: "09:15",
        arr: true
      }]
    }, {
      title: "Trip 1 continues — Leicester → Nottingham",
      stops: [{
        stop: "Leicester St Margaret's Bus Station",
        time: "09:20",
        dep: true
      }, {
        stop: "Nottingham Broad Marsh Bus Station",
        time: "10:15",
        arr: true
      }]
    }, {
      title: "Trip 2 — Nottingham → Victoria",
      stops: [{
        stop: "Nottingham Broad Marsh Bus Station",
        time: "11:30",
        dep: true
      }, {
        stop: "Nottingham University University Boulevard",
        time: "11:40"
      }, {
        stop: "Golders Green Bus Station Stop GE",
        time: "14:00"
      }, {
        stop: "Marble Arch Park Lane",
        time: "14:35"
      }, {
        stop: "Victoria Coach Station arrivals",
        time: "14:50",
        arr: true
      }]
    }, {
      title: "Handover & Return",
      stops: [{
        stop: "Hand over Coach 9 to Duty 328",
        time: "15:00"
      }, {
        stop: "Travel on Tube back to Depot",
        time: "15:32",
        notes: "Elizabeth Line 15:32"
      }, {
        stop: "Sign Off",
        time: "16:10"
      }]
    }]
  },
  363: {
    number: 363,
    days: "Saturday & Sunday",
    route: "Route 450 — Nottingham",
    signOn: "04:50",
    signOff: "16:10",
    dutyLength: "11:20",
    coach: "Coach 9",
    reminders: ["Ensure you have a 45 minute break", "Record travel movement as other work on tachograph", "When on a motorway you are in control of your excess speed"],
    tubeInfo: "Elizabeth Line departs at 15:32",
    segments: [{
      title: "Preparation",
      stops: [{
        stop: "Sign On — Walk round check Coach 9",
        time: "04:50"
      }, {
        stop: "Empty to Victoria Coach Station",
        time: "05:10"
      }, {
        stop: "Arrive for loading",
        time: "06:20"
      }]
    }, {
      title: "Trip 1 — Victoria → Milton Keynes → Leicester → Nottingham",
      stops: [{
        stop: "Victoria Coach Station departures",
        time: "06:30",
        dep: true
      }, {
        stop: "Milton Keynes Coachway",
        time: "07:50"
      }, {
        stop: "Leicester St Margaret's Bus Station",
        time: "09:00",
        arr: true
      }]
    }, {
      title: "Trip 1 continues — Leicester → Nottingham",
      stops: [{
        stop: "Leicester St Margaret's Bus Station",
        time: "09:05",
        dep: true
      }, {
        stop: "Nottingham Broad Marsh Bus Station",
        time: "09:55",
        arr: true
      }]
    }, {
      title: "Trip 2 — Nottingham → Victoria",
      stops: [{
        stop: "Nottingham Broad Marsh Bus Station",
        time: "11:30",
        dep: true
      }, {
        stop: "Nottingham University University Boulevard",
        time: "11:40"
      }, {
        stop: "Golders Green Bus Station Stop GE",
        time: "14:00"
      }, {
        stop: "Marble Arch Park Lane",
        time: "14:35"
      }, {
        stop: "Victoria Coach Station arrivals",
        time: "14:50",
        arr: true
      }]
    }, {
      title: "Handover & Return",
      stops: [{
        stop: "Hand over Coach 9 to Duty 368",
        time: "15:00"
      }, {
        stop: "Travel on Tube back to Depot",
        time: "15:32",
        notes: "Elizabeth Line 15:32"
      }, {
        stop: "Sign Off",
        time: "16:10"
      }]
    }]
  },
  304: {
    number: 304,
    days: "Friday & Monday",
    route: "Route 400 — Birmingham",
    signOn: "05:45",
    signOff: "16:40",
    dutyLength: "10:55",
    coach: "Coach 8",
    reminders: ["Ensure you have a 45 minute break", "Record travel movement as other work on tachograph", "When on a motorway you are in control of your excess speed"],
    tubeInfo: "Elizabeth Line departs at 16:02",
    segments: [{
      title: "Preparation",
      stops: [{
        stop: "Sign On — Walk round check Coach 8",
        time: "05:45"
      }, {
        stop: "Empty to Victoria Coach Station",
        time: "06:05"
      }, {
        stop: "Arrive for loading",
        time: "07:20"
      }]
    }, {
      title: "Trip 1 — Victoria → Birmingham",
      stops: [{
        stop: "Victoria Coach Station departures",
        time: "07:30",
        dep: true
      }, {
        stop: "Golders Green Bus Station Stop GE",
        time: "08:15"
      }, {
        stop: "Birmingham Digbeth",
        time: "10:40",
        arr: true
      }]
    }, {
      title: "Trip 2 — Birmingham → Victoria",
      stops: [{
        stop: "Birmingham Digbeth",
        time: "11:45",
        dep: true
      }, {
        stop: "Greenford Middleston Avenue",
        time: "14:00"
      }, {
        stop: "North Acton Friary Road",
        time: "14:10"
      }, {
        stop: "Marble Arch Park Lane",
        time: "14:35"
      }, {
        stop: "Victoria Coach Station arrivals",
        time: "14:50",
        arr: true
      }]
    }, {
      title: "Handover & Return",
      stops: [{
        stop: "Hand over Coach 8 to Duty 309",
        time: "15:10"
      }, {
        stop: "Travel on Tube back to Depot",
        time: "16:02",
        notes: "Elizabeth Line 16:02"
      }, {
        stop: "Sign Off",
        time: "16:40"
      }]
    }]
  },
  324: {
    number: 324,
    days: "Tuesday to Thursday",
    route: "Route 400 — Birmingham",
    signOn: "05:45",
    signOff: "16:40",
    dutyLength: "10:55",
    coach: "Coach 8",
    reminders: ["Ensure you have a 45 minute break", "Record travel movement as other work on tachograph", "When on a motorway you are in control of your excess speed"],
    tubeInfo: "Elizabeth Line departs at 16:02",
    segments: [{
      title: "Preparation",
      stops: [{
        stop: "Sign On — Walk round check Coach 8",
        time: "05:45"
      }, {
        stop: "Empty to Victoria Coach Station",
        time: "06:05"
      }, {
        stop: "Arrive for loading",
        time: "07:20"
      }]
    }, {
      title: "Trip 1 — Victoria → Birmingham",
      stops: [{
        stop: "Victoria Coach Station departures",
        time: "07:30",
        dep: true
      }, {
        stop: "Golders Green Bus Station Stop GE",
        time: "08:15"
      }, {
        stop: "Birmingham Digbeth",
        time: "10:35",
        arr: true
      }]
    }, {
      title: "Trip 2 — Birmingham → Victoria",
      stops: [{
        stop: "Birmingham Digbeth",
        time: "11:45",
        dep: true
      }, {
        stop: "Greenford Middleston Avenue",
        time: "14:00"
      }, {
        stop: "North Acton Friary Road",
        time: "14:10"
      }, {
        stop: "Marble Arch Park Lane",
        time: "14:35"
      }, {
        stop: "Victoria Coach Station arrivals",
        time: "14:50",
        arr: true
      }]
    }, {
      title: "Handover & Return",
      stops: [{
        stop: "Hand over Coach 8 to Duty 329",
        time: "15:10"
      }, {
        stop: "Travel on Tube back to Depot",
        time: "16:02",
        notes: "Elizabeth Line 16:02"
      }, {
        stop: "Sign Off",
        time: "16:40"
      }]
    }]
  },
  364: {
    number: 364,
    days: "Saturday & Sunday",
    route: "Route 400 — Birmingham",
    signOn: "05:45",
    signOff: "16:40",
    dutyLength: "10:55",
    coach: "Coach 8",
    reminders: ["Ensure you have a 45 minute break", "Record travel movement as other work on tachograph", "When on a motorway you are in control of your excess speed"],
    tubeInfo: "Elizabeth Line departs at 16:02",
    segments: [{
      title: "Preparation",
      stops: [{
        stop: "Sign On — Walk round check Coach 8",
        time: "05:45"
      }, {
        stop: "Empty to Victoria Coach Station",
        time: "06:20"
      }, {
        stop: "Arrive for loading",
        time: "07:20"
      }]
    }, {
      title: "Trip 1 — Victoria → Birmingham",
      stops: [{
        stop: "Victoria Coach Station departures",
        time: "07:30",
        dep: true
      }, {
        stop: "Golders Green Bus Station Stop GE",
        time: "08:10"
      }, {
        stop: "Birmingham Digbeth",
        time: "10:30",
        arr: true
      }]
    }, {
      title: "Trip 2 — Birmingham → Victoria",
      stops: [{
        stop: "Birmingham Digbeth",
        time: "11:45",
        dep: true
      }, {
        stop: "Greenford Middleston Avenue",
        time: "14:00"
      }, {
        stop: "North Acton Friary Road",
        time: "14:10"
      }, {
        stop: "Marble Arch Park Lane",
        time: "14:35"
      }, {
        stop: "Victoria Coach Station arrivals",
        time: "14:50",
        arr: true
      }]
    }, {
      title: "Handover & Return",
      stops: [{
        stop: "Hand over Coach 8 to Duty 369",
        time: "15:10"
      }, {
        stop: "Travel on Tube back to Depot",
        time: "16:02",
        notes: "Elizabeth Line 16:02"
      }, {
        stop: "Sign Off",
        time: "16:40"
      }]
    }]
  },
  // ── NETWORK LATE DUTIES ───────────────────────────────────
  306: {
    number: 306,
    days: "Monday to Friday",
    route: "Route 025 — Brighton",
    signOn: "12:35",
    signOff: "22:50",
    dutyLength: "10:15",
    coach: "Coach 6",
    reminders: ["Ensure you have a 45 minute break", "Record travel movement as other work on tachograph", "When on a motorway you are in control of your excess speed"],
    tubeInfo: "Tube departs at 12:45",
    segments: [{
      title: "Travel to Victoria",
      stops: [{
        stop: "Sign On",
        time: "12:35"
      }, {
        stop: "Travel on Tube to Victoria Coach Station",
        time: "12:45"
      }]
    }, {
      title: "Trip 1 — Victoria → Heathrow → Gatwick → Brighton",
      stops: [{
        stop: "Take over Coach 6 from Duty 301",
        time: "13:40",
        notes: "Takeover"
      }, {
        stop: "Victoria Coach Station departures",
        time: "14:00",
        dep: true
      }, {
        stop: "Heathrow Central Bus Station",
        time: "15:00"
      }, {
        stop: "Heathrow Terminal 5",
        time: "15:15"
      }, {
        stop: "Gatwick North Terminal",
        time: "16:15"
      }, {
        stop: "Gatwick South Terminal",
        time: "16:25"
      }, {
        stop: "Hickstead Bus Stop",
        time: "16:50"
      }, {
        stop: "Patcham Black Lion",
        time: "17:03"
      }, {
        stop: "Withdean Park The Deneway",
        time: "17:05"
      }, {
        stop: "Preston Park Hotel",
        time: "17:07"
      }, {
        stop: "Preston Circus London Road",
        time: "17:12"
      }, {
        stop: "York Place St Peters Church",
        time: "17:15"
      }, {
        stop: "Brighton Pool Valley",
        time: "17:25",
        arr: true
      }]
    }, {
      title: "Trip 2 — Brighton → Gatwick → Heathrow → Victoria",
      stops: [{
        stop: "Brighton Pool Valley",
        time: "18:20",
        dep: true
      }, {
        stop: "Preston Circus Carters",
        time: "18:27"
      }, {
        stop: "Preston Park Sainsburys",
        time: "18:30"
      }, {
        stop: "Withdean Park The Deneway",
        time: "18:32"
      }, {
        stop: "Patcham Black Lion",
        time: "18:34"
      }, {
        stop: "Hickstead Bus Stop",
        time: "18:44"
      }, {
        stop: "Gatwick South Terminal",
        time: "19:05"
      }, {
        stop: "Gatwick North Terminal",
        time: "19:20"
      }, {
        stop: "Heathrow Terminal 5",
        time: "20:20"
      }, {
        stop: "Heathrow Central Bus Station",
        time: "20:35"
      }, {
        stop: "Victoria Coach Station arrivals",
        time: "21:40",
        arr: true
      }]
    }, {
      title: "Return to Depot",
      stops: [{
        stop: "Empty to Depot",
        time: "21:40"
      }, {
        stop: "Sign Off",
        time: "22:50"
      }]
    }]
  },
  366: {
    number: 366,
    days: "Saturday & Sunday",
    route: "Route 025 — Brighton",
    signOn: "12:35",
    signOff: "22:50",
    dutyLength: "10:15",
    coach: "Coach 6",
    reminders: ["Ensure you have a 45 minute break", "Record travel movement as other work on tachograph", "When on a motorway you are in control of your excess speed"],
    tubeInfo: "Tube departs at 12:45",
    segments: [{
      title: "Travel to Victoria",
      stops: [{
        stop: "Sign On",
        time: "12:35"
      }, {
        stop: "Travel on Tube to Victoria Coach Station",
        time: "12:45"
      }]
    }, {
      title: "Trip 1 — Victoria → Heathrow → Gatwick → Brighton",
      stops: [{
        stop: "Take over Coach 6 from Duty 301",
        time: "13:40",
        notes: "Takeover"
      }, {
        stop: "Victoria Coach Station departures",
        time: "14:00",
        dep: true
      }, {
        stop: "Heathrow Central Bus Station",
        time: "14:55"
      }, {
        stop: "Heathrow Terminal 5",
        time: "15:10"
      }, {
        stop: "Gatwick North Terminal",
        time: "16:05"
      }, {
        stop: "Gatwick South Terminal",
        time: "16:15"
      }, {
        stop: "Hickstead Bus Stop",
        time: "16:40"
      }, {
        stop: "Patcham Black Lion",
        time: "16:53"
      }, {
        stop: "Withdean Park The Deneway",
        time: "16:55"
      }, {
        stop: "Preston Park Hotel",
        time: "16:57"
      }, {
        stop: "Preston Circus London Road",
        time: "17:02"
      }, {
        stop: "York Place St Peters Church",
        time: "17:05"
      }, {
        stop: "Brighton Pool Valley",
        time: "17:15",
        arr: true
      }]
    }, {
      title: "Trip 2 — Brighton → Gatwick → Heathrow → Victoria",
      stops: [{
        stop: "Brighton Pool Valley",
        time: "18:20",
        dep: true
      }, {
        stop: "Preston Circus Carters",
        time: "18:27"
      }, {
        stop: "Preston Park Sainsburys",
        time: "18:30"
      }, {
        stop: "Withdean Park The Deneway",
        time: "18:32"
      }, {
        stop: "Patcham Black Lion",
        time: "18:34"
      }, {
        stop: "Hickstead Bus Stop",
        time: "18:44"
      }, {
        stop: "Gatwick South Terminal",
        time: "19:05"
      }, {
        stop: "Gatwick North Terminal",
        time: "19:20"
      }, {
        stop: "Heathrow Terminal 5",
        time: "20:20"
      }, {
        stop: "Heathrow Central Bus Station",
        time: "20:35"
      }, {
        stop: "Victoria Coach Station arrivals",
        time: "21:40",
        arr: true
      }]
    }, {
      title: "Return to Depot",
      stops: [{
        stop: "Empty to Depot",
        time: "21:40"
      }, {
        stop: "Sign Off",
        time: "22:50"
      }]
    }]
  },
  307: {
    number: 307,
    days: "Monday",
    route: "Route 400 — Birmingham",
    signOn: "12:35",
    signOff: "23:45",
    dutyLength: "11:10",
    coach: "Coach 7",
    reminders: ["Ensure you have a 45 minute break", "Record travel movement as other work on tachograph", "When on a motorway you are in control of your excess speed"],
    tubeInfo: "Tube departs at 12:45",
    segments: [{
      title: "Travel to Victoria",
      stops: [{
        stop: "Sign On",
        time: "12:35"
      }, {
        stop: "Travel on Tube to Victoria Coach Station",
        time: "12:45"
      }]
    }, {
      title: "Trip 1 — Victoria → Birmingham",
      stops: [{
        stop: "Take over Coach 7 from Duty 302",
        time: "13:40",
        notes: "Takeover"
      }, {
        stop: "Victoria Coach Station departures",
        time: "15:00",
        dep: true
      }, {
        stop: "North Acton Friary Road",
        time: "15:40"
      }, {
        stop: "Greenford Greenford Roundabout",
        time: "15:48"
      }, {
        stop: "Birmingham Digbeth",
        time: "18:25",
        arr: true
      }]
    }, {
      title: "Trip 2 — Birmingham → Victoria",
      stops: [{
        stop: "Birmingham Digbeth",
        time: "19:40",
        dep: true
      }, {
        stop: "Golders Green Bus Station Stop GE",
        time: "22:00"
      }, {
        stop: "Marble Arch Park Lane",
        time: "22:25"
      }, {
        stop: "Victoria Coach Station arrivals",
        time: "22:35",
        arr: true
      }]
    }, {
      title: "Return to Depot",
      stops: [{
        stop: "Empty to Depot",
        time: "22:35"
      }, {
        stop: "Sign Off",
        time: "23:45"
      }]
    }]
  },
  327: {
    number: 327,
    days: "Tuesday to Thursday",
    route: "Route 400 — Birmingham",
    signOn: "12:35",
    signOff: "23:45",
    dutyLength: "11:10",
    coach: "Coach 7",
    reminders: ["Ensure you have a 45 minute break", "Record travel movement as other work on tachograph", "When on a motorway you are in control of your excess speed"],
    tubeInfo: "Tube departs at 12:45",
    segments: [{
      title: "Travel to Victoria",
      stops: [{
        stop: "Sign On",
        time: "12:35"
      }, {
        stop: "Travel on Tube to Victoria Coach Station",
        time: "12:45"
      }]
    }, {
      title: "Trip 1 — Victoria → Birmingham",
      stops: [{
        stop: "Take over Coach 7 from Duty 302",
        time: "13:40",
        notes: "Takeover"
      }, {
        stop: "Victoria Coach Station departures",
        time: "15:00",
        dep: true
      }, {
        stop: "Golders Green Bus Station Stop GE",
        time: "15:45"
      }, {
        stop: "Birmingham Digbeth",
        time: "18:25",
        arr: true
      }]
    }, {
      title: "Trip 2 — Birmingham → Victoria",
      stops: [{
        stop: "Birmingham Digbeth",
        time: "19:40",
        dep: true
      }, {
        stop: "Golders Green Bus Station Stop GE",
        time: "22:00"
      }, {
        stop: "Marble Arch Park Lane",
        time: "22:25"
      }, {
        stop: "Victoria Coach Station arrivals",
        time: "22:35",
        arr: true
      }]
    }, {
      title: "Return to Depot",
      stops: [{
        stop: "Empty to Depot",
        time: "22:35"
      }, {
        stop: "Sign Off",
        time: "23:45"
      }]
    }]
  },
  367: {
    number: 367,
    days: "Saturday & Sunday",
    route: "Route 400 — Birmingham",
    signOn: "12:35",
    signOff: "23:45",
    dutyLength: "11:10",
    coach: "Coach 7",
    reminders: ["Ensure you have a 45 minute break", "Record travel movement as other work on tachograph", "When on a motorway you are in control of your excess speed"],
    tubeInfo: "Tube departs at 12:45",
    segments: [{
      title: "Travel to Victoria",
      stops: [{
        stop: "Sign On",
        time: "12:35"
      }, {
        stop: "Travel on Tube to Victoria Coach Station",
        time: "12:45"
      }]
    }, {
      title: "Trip 1 — Victoria → Birmingham",
      stops: [{
        stop: "Take over Coach 7 from Duty 362",
        time: "13:40",
        notes: "Takeover"
      }, {
        stop: "Victoria Coach Station departures",
        time: "15:00",
        dep: true
      }, {
        stop: "North Acton Friary Road",
        time: "15:35"
      }, {
        stop: "Greenford Greenford Roundabout",
        time: "15:43"
      }, {
        stop: "Birmingham Digbeth",
        time: "18:10",
        arr: true
      }]
    }, {
      title: "Trip 2 — Birmingham → Victoria",
      stops: [{
        stop: "Birmingham Digbeth",
        time: "19:40",
        dep: true
      }, {
        stop: "Golders Green Bus Station Stop GE",
        time: "22:00"
      }, {
        stop: "Marble Arch Park Lane",
        time: "22:25"
      }, {
        stop: "Victoria Coach Station arrivals",
        time: "22:35",
        arr: true
      }]
    }, {
      title: "Return to Depot",
      stops: [{
        stop: "Empty to Depot",
        time: "22:35"
      }, {
        stop: "Sign Off",
        time: "23:45"
      }]
    }]
  },
  308: {
    number: 308,
    days: "Monday",
    route: "Route 450 — Nottingham",
    signOn: "13:35",
    signOff: "01:05",
    dutyLength: "11:30",
    coach: "Coach 9",
    reminders: ["Ensure you have a 45 minute break", "Record travel movement as other work on tachograph", "When on a motorway you are in control of your excess speed"],
    tubeInfo: "Tube departs at 13:45",
    segments: [{
      title: "Travel to Victoria",
      stops: [{
        stop: "Sign On",
        time: "13:35"
      }, {
        stop: "Travel on Tube to Victoria Coach Station",
        time: "13:45"
      }]
    }, {
      title: "Trip 1 — Victoria → Nottingham",
      stops: [{
        stop: "Take over Coach 9 from Duty 303",
        time: "15:00",
        notes: "Takeover"
      }, {
        stop: "Victoria Coach Station departures",
        time: "15:30",
        dep: true
      }, {
        stop: "Golders Green Bus Station Stop GE",
        time: "16:15"
      }, {
        stop: "Nottingham University University Boulevard",
        time: "19:00"
      }, {
        stop: "Nottingham Broad Marsh Bus Station",
        time: "19:10",
        arr: true
      }]
    }, {
      title: "Trip 2 — Nottingham → Leicester → Milton Keynes → Victoria",
      stops: [{
        stop: "Nottingham Broad Marsh Bus Station",
        time: "20:35",
        dep: true
      }, {
        stop: "Leicester St Margaret's Bus Station",
        time: "21:20",
        arr: true
      }]
    }, {
      title: "Trip 2 continues — Leicester → Victoria",
      stops: [{
        stop: "Leicester St Margaret's Bus Station",
        time: "21:30",
        dep: true
      }, {
        stop: "Milton Keynes Coachway",
        time: "22:40"
      }, {
        stop: "Marble Arch Park Lane",
        time: "23:55"
      }, {
        stop: "Victoria Coach Station arrivals",
        time: "00:05",
        arr: true
      }]
    }, {
      title: "Return to Depot",
      stops: [{
        stop: "Empty to Depot",
        time: "00:05"
      }, {
        stop: "Sign Off",
        time: "01:05"
      }]
    }]
  },
  328: {
    number: 328,
    days: "Tuesday to Thursday",
    route: "Route 450 — Nottingham",
    signOn: "13:35",
    signOff: "01:05",
    dutyLength: "11:30",
    coach: "Coach 9",
    reminders: ["Ensure you have a 45 minute break", "Record travel movement as other work on tachograph", "When on a motorway you are in control of your excess speed"],
    tubeInfo: "Tube departs at 13:45",
    segments: [{
      title: "Travel to Victoria",
      stops: [{
        stop: "Sign On",
        time: "13:35"
      }, {
        stop: "Travel on Tube to Victoria Coach Station",
        time: "13:45"
      }]
    }, {
      title: "Trip 1 — Victoria → Nottingham",
      stops: [{
        stop: "Take over Coach 9 from Duty 323",
        time: "15:00",
        notes: "Takeover"
      }, {
        stop: "Victoria Coach Station departures",
        time: "15:30",
        dep: true
      }, {
        stop: "Golders Green Bus Station Stop GE",
        time: "16:15"
      }, {
        stop: "Nottingham University University Boulevard",
        time: "18:45"
      }, {
        stop: "Nottingham Broad Marsh Bus Station",
        time: "18:55",
        arr: true
      }]
    }, {
      title: "Trip 2 — Nottingham → Leicester → Milton Keynes → Victoria",
      stops: [{
        stop: "Nottingham Broad Marsh Bus Station",
        time: "20:35",
        dep: true
      }, {
        stop: "Leicester St Margaret's Bus Station",
        time: "21:20",
        arr: true
      }]
    }, {
      title: "Trip 2 continues — Leicester → Victoria",
      stops: [{
        stop: "Leicester St Margaret's Bus Station",
        time: "21:30",
        dep: true
      }, {
        stop: "Milton Keynes Coachway",
        time: "22:40"
      }, {
        stop: "Marble Arch Park Lane",
        time: "23:55"
      }, {
        stop: "Victoria Coach Station arrivals",
        time: "00:05",
        arr: true
      }]
    }, {
      title: "Return to Depot",
      stops: [{
        stop: "Empty to Depot",
        time: "00:05"
      }, {
        stop: "Sign Off",
        time: "01:05"
      }]
    }]
  },
  348: {
    number: 348,
    days: "Friday",
    route: "Route 450 — Nottingham",
    signOn: "13:35",
    signOff: "01:05",
    dutyLength: "11:30",
    coach: "Coach 9",
    reminders: ["Ensure you have a 45 minute break", "Record travel movement as other work on tachograph", "When on a motorway you are in control of your excess speed"],
    tubeInfo: "Tube departs at 13:45",
    segments: [{
      title: "Travel to Victoria",
      stops: [{
        stop: "Sign On",
        time: "13:35"
      }, {
        stop: "Travel on Tube to Victoria Coach Station",
        time: "13:45"
      }]
    }, {
      title: "Trip 1 — Victoria → Nottingham",
      stops: [{
        stop: "Take over Coach 9 from Duty 303",
        time: "15:00",
        notes: "Takeover"
      }, {
        stop: "Victoria Coach Station departures",
        time: "15:30",
        dep: true
      }, {
        stop: "Golders Green Bus Station Stop GE",
        time: "16:20"
      }, {
        stop: "Nottingham University University Boulevard",
        time: "19:05"
      }, {
        stop: "Nottingham Broad Marsh Bus Station",
        time: "19:15",
        arr: true
      }]
    }, {
      title: "Trip 2 — Nottingham → Leicester → Milton Keynes → Victoria",
      stops: [{
        stop: "Nottingham Broad Marsh Bus Station",
        time: "20:35",
        dep: true
      }, {
        stop: "Leicester St Margaret's Bus Station",
        time: "21:20",
        arr: true
      }]
    }, {
      title: "Trip 2 continues — Leicester → Victoria",
      stops: [{
        stop: "Leicester St Margaret's Bus Station",
        time: "21:30",
        dep: true
      }, {
        stop: "Milton Keynes Coachway",
        time: "22:40"
      }, {
        stop: "Marble Arch Park Lane",
        time: "23:55"
      }, {
        stop: "Victoria Coach Station arrivals",
        time: "00:05",
        arr: true
      }]
    }, {
      title: "Return to Depot",
      stops: [{
        stop: "Empty to Depot",
        time: "00:05"
      }, {
        stop: "Sign Off",
        time: "01:05"
      }]
    }]
  },
  368: {
    number: 368,
    days: "Saturday & Sunday",
    route: "Route 450 — Nottingham",
    signOn: "13:35",
    signOff: "01:05",
    dutyLength: "11:30",
    coach: "Coach 9",
    reminders: ["Ensure you have a 45 minute break", "Record travel movement as other work on tachograph", "When on a motorway you are in control of your excess speed"],
    tubeInfo: "Tube departs at 13:45",
    segments: [{
      title: "Travel to Victoria",
      stops: [{
        stop: "Sign On",
        time: "13:35"
      }, {
        stop: "Travel on Tube to Victoria Coach Station",
        time: "13:45"
      }]
    }, {
      title: "Trip 1 — Victoria → Nottingham",
      stops: [{
        stop: "Take over Coach 9 from Duty 363",
        time: "15:00",
        notes: "Takeover"
      }, {
        stop: "Victoria Coach Station departures",
        time: "15:30",
        dep: true
      }, {
        stop: "Golders Green Bus Station Stop GE",
        time: "16:15"
      }, {
        stop: "Nottingham University University Boulevard",
        time: "18:45"
      }, {
        stop: "Nottingham Broad Marsh Bus Station",
        time: "18:55",
        arr: true
      }]
    }, {
      title: "Trip 2 — Nottingham → Leicester → Milton Keynes → Victoria",
      stops: [{
        stop: "Nottingham Broad Marsh Bus Station",
        time: "20:35",
        dep: true
      }, {
        stop: "Leicester St Margaret's Bus Station",
        time: "21:20",
        arr: true
      }]
    }, {
      title: "Trip 2 continues — Leicester → Victoria",
      stops: [{
        stop: "Leicester St Margaret's Bus Station",
        time: "21:30",
        dep: true
      }, {
        stop: "Milton Keynes Coachway",
        time: "22:40"
      }, {
        stop: "Marble Arch Park Lane",
        time: "23:55"
      }, {
        stop: "Victoria Coach Station arrivals",
        time: "00:05",
        arr: true
      }]
    }, {
      title: "Return to Depot",
      stops: [{
        stop: "Empty to Depot",
        time: "00:05"
      }, {
        stop: "Sign Off",
        time: "01:05"
      }]
    }]
  },
  309: {
    number: 309,
    days: "Friday & Monday",
    route: "Route 400 — Birmingham",
    signOn: "14:05",
    signOff: "00:45",
    dutyLength: "10:40",
    coach: "Coach 8",
    reminders: ["Ensure you have a 45 minute break", "Record travel movement as other work on tachograph", "When on a motorway you are in control of your excess speed"],
    tubeInfo: "Tube departs at 14:14",
    segments: [{
      title: "Travel to Victoria",
      stops: [{
        stop: "Sign On",
        time: "14:05"
      }, {
        stop: "Travel on Tube to Victoria Coach Station",
        time: "14:14"
      }]
    }, {
      title: "Trip 1 — Victoria → Birmingham",
      stops: [{
        stop: "Take over Coach 8 from Duty 304",
        time: "15:10",
        notes: "Takeover"
      }, {
        stop: "Victoria Coach Station departures",
        time: "16:00",
        dep: true
      }, {
        stop: "Golders Green Bus Station Stop GE",
        time: "16:55"
      }, {
        stop: "Birmingham Digbeth",
        time: "19:45",
        arr: true
      }]
    }, {
      title: "Trip 2 — Birmingham → Victoria",
      stops: [{
        stop: "Birmingham Digbeth",
        time: "20:45",
        dep: true
      }, {
        stop: "Finchley Road Tube Station",
        time: "23:00"
      }, {
        stop: "Marble Arch Park Lane",
        time: "23:25"
      }, {
        stop: "Victoria Coach Station arrivals",
        time: "23:35",
        arr: true
      }]
    }, {
      title: "Return to Depot",
      stops: [{
        stop: "Empty to Depot",
        time: "23:35"
      }, {
        stop: "Sign Off",
        time: "00:45"
      }]
    }]
  },
  329: {
    number: 329,
    days: "Tuesday to Thursday",
    route: "Route 400 — Birmingham",
    signOn: "14:05",
    signOff: "00:45",
    dutyLength: "10:40",
    coach: "Coach 8",
    reminders: ["Ensure you have a 45 minute break", "Record travel movement as other work on tachograph", "When on a motorway you are in control of your excess speed"],
    tubeInfo: "Tube departs at 14:14",
    segments: [{
      title: "Travel to Victoria",
      stops: [{
        stop: "Sign On",
        time: "14:05"
      }, {
        stop: "Travel on Tube to Victoria Coach Station",
        time: "14:14"
      }]
    }, {
      title: "Trip 1 — Victoria → Birmingham",
      stops: [{
        stop: "Take over Coach 8 from Duty 324",
        time: "15:10",
        notes: "Takeover"
      }, {
        stop: "Victoria Coach Station departures",
        time: "16:00",
        dep: true
      }, {
        stop: "North Acton Friary Road",
        time: "16:40"
      }, {
        stop: "Greenford Greenford Roundabout",
        time: "16:48"
      }, {
        stop: "Birmingham Digbeth",
        time: "19:30",
        arr: true
      }]
    }, {
      title: "Trip 2 — Birmingham → Victoria",
      stops: [{
        stop: "Birmingham Digbeth",
        time: "20:45",
        dep: true
      }, {
        stop: "Finchley Road Tube Station",
        time: "23:00"
      }, {
        stop: "Marble Arch Park Lane",
        time: "23:25"
      }, {
        stop: "Victoria Coach Station arrivals",
        time: "23:35",
        arr: true
      }]
    }, {
      title: "Return to Depot",
      stops: [{
        stop: "Empty to Depot",
        time: "23:35"
      }, {
        stop: "Sign Off",
        time: "00:45"
      }]
    }]
  },
  369: {
    number: 369,
    days: "Saturday & Sunday",
    route: "Route 400 — Birmingham",
    signOn: "14:05",
    signOff: "00:45",
    dutyLength: "10:40",
    coach: "Coach 8",
    reminders: ["Ensure you have a 45 minute break", "Record travel movement as other work on tachograph", "When on a motorway you are in control of your excess speed"],
    tubeInfo: "Tube departs at 14:14",
    segments: [{
      title: "Travel to Victoria",
      stops: [{
        stop: "Sign On",
        time: "14:05"
      }, {
        stop: "Travel on Tube to Victoria Coach Station",
        time: "14:14"
      }]
    }, {
      title: "Trip 1 — Victoria → Birmingham",
      stops: [{
        stop: "Take over Coach 8 from Duty 364",
        time: "15:10",
        notes: "Takeover"
      }, {
        stop: "Victoria Coach Station departures",
        time: "16:00",
        dep: true
      }, {
        stop: "Golders Green Bus Station Stop GE",
        time: "16:50"
      }, {
        stop: "Birmingham Digbeth",
        time: "19:25",
        arr: true
      }]
    }, {
      title: "Trip 2 — Birmingham → Victoria",
      stops: [{
        stop: "Birmingham Digbeth",
        time: "20:45",
        dep: true
      }, {
        stop: "Finchley Road Tube Station",
        time: "23:00"
      }, {
        stop: "Marble Arch Park Lane",
        time: "23:25"
      }, {
        stop: "Victoria Coach Station arrivals",
        time: "23:35",
        arr: true
      }]
    }, {
      title: "Return to Depot",
      stops: [{
        stop: "Empty to Depot",
        time: "23:35"
      }, {
        stop: "Sign Off",
        time: "00:45"
      }]
    }]
  },
  347: {
    number: 347,
    days: "Friday",
    route: "Route 400 — Birmingham",
    signOn: "12:35",
    signOff: "23:45",
    dutyLength: "11:10",
    coach: "Coach 7",
    reminders: ["Ensure you have a 45 minute break", "Record travel movement as other work on tachograph", "When on a motorway you are in control of your excess speed"],
    tubeInfo: "Tube departs at 12:45",
    segments: [{
      title: "Travel to Victoria Coach Station",
      stops: [{
        stop: "Sign On",
        time: "12:35"
      }, {
        stop: "Travel on Tube to Victoria Coach Station",
        time: "12:45",
        notes: "Tube departs 12:45"
      }]
    }, {
      title: "Trip 1 — Victoria → Birmingham",
      stops: [{
        stop: "Take over Coach 7 from Duty 302",
        time: "13:40",
        notes: "Takeover"
      }, {
        stop: "Victoria Coach Station",
        time: "15:00",
        dep: true
      }, {
        stop: "North Acton Friary Road",
        time: "15:40"
      }, {
        stop: "Greenford Greenford Roundabout",
        time: "15:48"
      }, {
        stop: "Birmingham Digbeth",
        time: "18:35",
        arr: true
      }]
    }, {
      title: "Trip 2 — Birmingham → Victoria",
      stops: [{
        stop: "Birmingham Digbeth",
        time: "19:40",
        dep: true
      }, {
        stop: "Golders Green Bus Station Stop GE",
        time: "22:00"
      }, {
        stop: "Marble Arch Park Lane",
        time: "22:25"
      }, {
        stop: "Victoria Coach Station",
        time: "22:35",
        arr: true
      }]
    }, {
      title: "Return to Depot",
      stops: [{
        stop: "Empty to Depot",
        time: "22:40"
      }, {
        stop: "Sign Off",
        time: "23:45"
      }]
    }]
  }
};
// ─── SPARE / SPECIAL DUTIES ────────────────────────────────────
const SPECIAL_DUTIES = {
  "USP": {
    label: "Ultra-Early Spare",
    signOn: "01:20",
    signOff: "11:20",
    dutyLength: "10:00",
    color: "#0f766e"
  },
  "ESP": {
    label: "Early Spare",
    signOn: "03:30",
    signOff: "13:30",
    dutyLength: "10:00",
    color: "#0f766e"
  },
  "MSP": {
    label: "Mid Spare",
    signOn: "11:45",
    signOff: "21:45",
    dutyLength: "10:00",
    color: "#0f766e"
  },
  "LSP": {
    label: "Late Spare",
    signOn: "15:45",
    signOff: "01:45",
    dutyLength: "10:00",
    color: "#0f766e"
  },
  "N Control": {
    label: "Night Control",
    signOn: "18:00",
    signOff: "06:00",
    dutyLength: "12:00",
    color: "#4338ca"
  },
  "D Control": {
    label: "Day Control",
    signOn: "06:00",
    signOff: "18:00",
    dutyLength: "12:00",
    color: "#4338ca"
  },
  "OPM": {
    label: "Management Duties",
    signOn: "07:00",
    signOff: "17:00",
    dutyLength: "10:00",
    color: "#64748b"
  },
  "DTO": {
    label: "Driver Training / Office",
    signOn: "—",
    signOff: "—",
    dutyLength: "—",
    color: "#06b6d4"
  },
  "TOUR": {
    label: "Tour Duty",
    signOn: "—",
    signOff: "—",
    dutyLength: "—",
    color: "#ec4899"
  },
  "WS": {
    label: "Workshop",
    signOn: "—",
    signOff: "—",
    dutyLength: "—",
    color: "#d97706"
  },
  "INDUCTION": {
    label: "Induction",
    signOn: "—",
    signOff: "—",
    dutyLength: "—",
    color: "#06b6d4"
  }
};
// ─── DAILY RUN OUT SHEET ────────────────────────────────────
// Populated nightly by the night controller before midnight
// Maps duty numbers to vehicle, driver, and changeover info
// When connected to SharePoint, this data comes from the Daily Run Out Sheet

const DAILY_RUNOUT = {
  // Date key format: "YYYY-MM-DD" — currently hardcoded for demo
  // When live, the serverless function reads today's tab from the run out Excel
  "2026-02-26": {
    // A6 duties — morning
    201: {
      vehicle: "BV23 ZXS",
      driver: "Bruno Rodrigues",
      signOn: "01:20",
      handoverTo: {
        duty: 206,
        driver: "Jomon Ponnapon",
        signOn: "12:05"
      }
    },
    202: {
      vehicle: "BV23 ZXO",
      driver: "Afolabi Ajewole",
      signOn: "02:10",
      handoverTo: {
        duty: 207,
        driver: "Vusi Maziya",
        signOn: "13:05"
      }
    },
    203: {
      vehicle: "BV72 XFE",
      driver: "Harpatarp Sandhu",
      signOn: "03:00",
      handoverTo: {
        duty: 208,
        driver: "Amar Habib",
        signOn: "14:05"
      }
    },
    204: {
      vehicle: "BV23 ZWE",
      driver: "Habib Mohammed",
      signOn: "04:00",
      handoverTo: {
        duty: 209,
        driver: "Denver Bent",
        signOn: "15:05"
      }
    },
    205: {
      vehicle: "BV23 ZXT",
      driver: "Frankie",
      signOn: "05:00",
      handoverTo: {
        duty: 210,
        driver: "Said Garad",
        signOn: "16:05"
      }
    },
    // A6 duties — afternoon (take over from morning)
    206: {
      vehicle: "BV23 ZXS",
      driver: "Jomon Ponnapon",
      signOn: "12:05",
      takeoverFrom: {
        duty: 201,
        driver: "Bruno Rodrigues"
      }
    },
    207: {
      vehicle: "BV23 ZXO",
      driver: "Vusi Maziya",
      signOn: "13:05",
      takeoverFrom: {
        duty: 202,
        driver: "Afolabi Ajewole"
      }
    },
    208: {
      vehicle: "BV72 XFE",
      driver: "Amar Habib",
      signOn: "14:05",
      takeoverFrom: {
        duty: 203,
        driver: "Harpatarp Sandhu"
      }
    },
    209: {
      vehicle: "BV23 ZWE",
      driver: "Denver Bent",
      signOn: "15:05",
      takeoverFrom: {
        duty: 204,
        driver: "Habib Mohammed"
      }
    },
    210: {
      vehicle: "BV23 ZXT",
      driver: "Said Garad",
      signOn: "16:05",
      takeoverFrom: {
        duty: 205,
        driver: "Frankie"
      }
    },
    // Network duties — morning
    301: {
      vehicle: "BV72 XEW",
      driver: "Mansoor Edris",
      signOn: "03:30",
      route: "025",
      destination: "Brighton",
      handoverTo: {
        duty: 306,
        driver: "Kevin Reid",
        signOn: "12:35"
      }
    },
    302: {
      vehicle: "BV23 ZXR",
      driver: "Gordon Jones",
      signOn: "04:30",
      route: "400",
      destination: "Birmingham",
      handoverTo: {
        duty: 327,
        driver: "Wegles Carter",
        signOn: "12:35"
      }
    },
    323: {
      vehicle: "BV22 VSK",
      driver: "Michael Jara",
      signOn: "04:50",
      route: "450",
      destination: "Nottingham",
      handoverTo: {
        duty: 328,
        driver: "Kennedy Ncube",
        signOn: "13:35"
      }
    },
    324: {
      vehicle: "BV23 ZXP",
      driver: "Mark Eke",
      signOn: "05:45",
      route: "400",
      destination: "Birmingham",
      handoverTo: {
        duty: 329,
        driver: "Sanjeev Rana",
        signOn: "14:05"
      }
    },
    // Network duties — afternoon
    306: {
      vehicle: "BV72 XEW",
      driver: "Kevin Reid",
      signOn: "12:35",
      route: "025",
      destination: "Brighton",
      takeoverFrom: {
        duty: 301,
        driver: "Mansoor Edris"
      }
    },
    327: {
      vehicle: "BV23 ZXR",
      driver: "Wegles Carter",
      signOn: "12:35",
      route: "400",
      destination: "Birmingham",
      takeoverFrom: {
        duty: 302,
        driver: "Gordon Jones"
      }
    },
    328: {
      vehicle: "BV22 VSK",
      driver: "Kennedy Ncube",
      signOn: "13:35",
      route: "450",
      destination: "Nottingham",
      takeoverFrom: {
        duty: 323,
        driver: "Michael Jara"
      }
    },
    329: {
      vehicle: "BV23 ZXP",
      driver: "Sanjeev Rana",
      signOn: "14:05",
      route: "400",
      destination: "Birmingham",
      takeoverFrom: {
        duty: 324,
        driver: "Mark Eke"
      }
    }
  }
};
const ROTA_NOTES = {
  "Denver Bent": {
    2: "Mahmudul Hoque:\nspoken and agreed"
  },
  "Iwona Czochra": {
    2: "Mahmudul Hoque:\nspoken and agreed",
    3: "Mahmudul Hoque:\nSPOKEN AND AGREED.\n\nSHOWED ME HER DOC LETTER"
  },
  "Said Garad": {
    0: "Muhammed Ali:\nSpoken and agreed",
    1: "Muhammed Ali:\nAvailable for OT",
    2: "Muhammed Ali:\nAvailable for OT"
  },
  "Zafar Harris": {
    1: "Joao Ferreira:\nrequested the day off\ntalk to me if need more info"
  },
  "Volito Rebello": {
    5: "Mahmudul Hoque:\nAVAILABLE"
  },
  "Umair Akram": {
    1: "Mahmudul Hoque:\nHoliday",
    2: "Mahmudul Hoque:\nholiday",
    3: "Mahmudul Hoque:\nHOLIDAY",
    4: "Mahmudul Hoque:\nHOLIDAY"
  },
  "Hacene Brinis": {
    1: "Mahmudul Hoque:\nREQUESTED TIME OFF",
    2: "Mahmudul Hoque:\nREQUESTED TIME OFF",
    3: "Mahmudul Hoque:\nREQUESTED TIME OFF",
    4: "Mahmudul Hoque:\nREQUESTED OFF"
  },
  "Oneil Thomas": {
    5: "Mahmudul Hoque:\nLOOK AT CM FOR MORE INFO\n\n0120 POSITION\n\n1230 IVER"
  },
  "Amar Habib": {
    2: "RL with Sanjeev",
    4: "RL with Wegles"
  },
  "Azhar Khan": {
    1: "RL with Wegles"
  },
  "Jeffrey Ralph": {
    2: "RL with Adrian",
    3: "RL with Kennedy",
    4: "RL with Vusi"
  },
  "Jerome Lionel": {
    1: "RL with Kevin"
  },
  "Paul Page": {
    5: "Mahmudul Hoque:\nPLEASE LOOK AT CM FOR MORE INFO\n\n1045 POSITION\n\n2200 IVER"
  },
  "Armaan Rana": {
    5: "Mahmudul Hoque:\n1030 IVER\n1150 VCS\n1200 PICK UP\n\n2120 IVER",
    6: "Mahmudul Hoque:\n1015 IVER\n\nA8\n\n2100 IVER"
  },
  "Ash Singh": {
    3: "Mahmudul Hoque:\nLOOK AT CM FOR MORE INFO\n\n2300 HAMPTON BY HILTON",
    5: "Mahmudul Hoque:\nCOACH 1\n\nIBIS LONDON DOCKLANDS\n0000 IVER"
  },
  "Kennedy Ncube": {
    1: "Mahmudul Hoque:\nSCHOOL RUN WITH COMMONWEALTH COACH.\n\nHE WILL NEED TO START WITH THE COMMONWEALTH COACH AT 0620 IN THE MORNING."
  },
  "George Hall": {
    0: "RL with Si",
    2: "RL with Gio"
  },
  "Joseph Goodwin": {
    0: "RL with Geovani",
    1: "RL with Sanjeev",
    2: "RL with Vusi",
    3: "RL with Sanjeev",
    4: "RL with Sanjeev"
  },
  "Nash Bridges": {
    5: "Mahmudul Hoque:\nplease look cm for more info\n\n2100 IVER\n\nA8 & A6\n\nBACK ON SUNDAY AT 0500"
  },
  "Salomon Castro": {
    5: "Mahmudul Hoque:\nLOOK AT CM FOR MORE INFO\n\n0115 POSITION\n\n1130 IVER",
    6: "Mahmudul Hoque:\n0830 IVER\n\nA6 & A9\n\n1710 IVER"
  },
  "Gordon Jones": {
    5: "Mahmudul Hoque:\nAGREED",
    6: "Mahmudul Hoque:\nLOOK AT CM FOR MORE INFO"
  },
  "Wegles Carter": {
    3: "Davina Howards:\nspoken with Wegles & she's agreed",
    5: "Mahmudul Hoque:\n2230 IVER\n\nA8\n\nBACK SUNDAY AT 0600"
  },
  "Adrian Koprowski": {
    5: "JOAO — SPOKEN AND AGREED\n\n1230 IVER\n\nA6 & A8\n\n2000 IVER",
    6: "JOAO — SPOKEN AND AGREED\n1330 IVER\n\nA6 & A9\n\n2140 IVER"
  },
  "Piotr Gawrys": {
    5: "Mahmudul Hoque:\nCOACH 2\n\nIBIS LONDON DOCKLANDS\n0000 IVER"
  }
};
// ─── GOOGLE SHEETS LIVE DATA ─────────────────────────────────
const GSHEET_PUB_BASE = "https://docs.google.com/spreadsheets/d/e/2PACX-1vRR4hSCivY7n92vpTGwayaOzGrI6ZULZxTYfTX7kp7VWCPBtvKZfLyKoTR9_f7AEaunbnhUuwV4DJpS";
const SECTION_KEY_MAP = {
  "Early A6": "early_a6",
  "Late A6": "late_a6",
  "Early Network": "early_network",
  "Late Network": "late_network",
  "Part Time Rota": "part_time",
  "Spare/Private Hire/Tour Drivers": "spare",
  "Work to cover": null,
  "Controllers": "controllers",
  "Cleaners (Fixed Nights)": "cleaners",
  "Shunters (4 ON / 4 OFF)": "shunters"
};
const SECTION_LABEL_MAP = {
  early_a6: "Early A6",
  late_a6: "Late A6",
  early_network: "Early Network",
  late_network: "Late Network",
  part_time: "Part Time",
  spare: "Spare / Private Hire / Tour",
  management: "Management Duties",
  controllers: "Controllers",
  cleaners: "Cleaners",
  shunters: "Shunters"
};

// Manual staff overrides stay in-code while external source integration is in progress.
const MANUAL_STAFF_OVERRIDES = [{
  name: "Errol Thomas",
  sectionKey: "management",
  week: ["OPM", "OPM", "OPM", "OPM", "OPM", "R", "R"]
}];

// Access control (development-friendly):
// - mode "soft": shared driver PIN works for all drivers
// - mode "strict": require per-user PIN or manager PIN
const ACCESS_CONTROL = {
  mode: "soft",
  managerNames: ["Kennedy Ncube", "Errol Thomas"],
  defaultDriverPinHash: "ed946f65d2c785d90e827c5ffd879ce3b49c68d4c88013074176a7e73bc58bcf",
  managerMasterPinHash: "07c903ce633842c12f7430406521a6d57fd72de978b2c667a5bf8ec2cc7f9a9c",
  userPinHashes: {}
};

  window.JET_DATA = {
    DUTY_CARDS,
    SPECIAL_DUTIES,
    DAILY_RUNOUT,
    ROTA_NOTES,
    GSHEET_PUB_BASE,
    SECTION_KEY_MAP,
    SECTION_LABEL_MAP,
    MANUAL_STAFF_OVERRIDES,
    ACCESS_CONTROL
  };
})(window);
