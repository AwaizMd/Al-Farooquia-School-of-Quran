// Default exam subjects per learning track (the server uses the same defaults).
export const SUBJECTS = {
  hifz: [{ name: 'Sabaq Recitation', max: 25 }, { name: 'Sabqi', max: 25 }, { name: 'Manzil', max: 25 }, { name: 'Tajweed', max: 25 }],
  nazira: [{ name: 'Reading Fluency', max: 30 }, { name: 'Tajweed', max: 30 }, { name: 'Makharij', max: 20 }, { name: 'Duas & Masail', max: 20 }],
  qaida: [{ name: 'Letter Recognition', max: 30 }, { name: 'Makharij', max: 30 }, { name: 'Joining & Harakat', max: 25 }, { name: 'Duas', max: 15 }],
  alim: [{ name: 'Nahw (Grammar)', max: 50 }, { name: 'Fiqh', max: 50 }, { name: 'Hadith', max: 50 }, { name: 'Seerah', max: 50 }],
}
