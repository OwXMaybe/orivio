import type { ClaimCategory } from "@/types/claim";

/** Illustrative, well-known claims for trying the engine. Not trending or current. */
export const EXAMPLE_CLAIMS: { category: ClaimCategory; en: string; tr: string }[] = [
  { category: "science", en: "Humans only use 10% of their brains.", tr: "İnsanlar beyinlerinin yalnızca %10'unu kullanır." },
  { category: "science", en: "Lightning never strikes the same place twice.", tr: "Yıldırım aynı yere iki kez düşmez." },
  { category: "health", en: "Vitamin C prevents the common cold.", tr: "C vitamini soğuk algınlığını önler." },
  { category: "health", en: "Cracking your knuckles causes arthritis.", tr: "Parmak çıtlatmak artrite neden olur." },
  { category: "history", en: "The Great Wall of China is visible from space with the naked eye.", tr: "Çin Seddi uzaydan çıplak gözle görülebilir." },
  { category: "history", en: "Napoleon Bonaparte was unusually short.", tr: "Napolyon Bonapart alışılmadık derecede kısa boyluydu." },
  { category: "environment", en: "Bats are blind.", tr: "Yarasalar kördür." },
  { category: "technology", en: "Charging a phone overnight damages its battery.", tr: "Telefonu gece boyunca şarj etmek bataryaya zarar verir." },
  { category: "education", en: "People learn better when taught in their preferred learning style.", tr: "İnsanlar tercih ettikleri öğrenme stiline göre öğretildiğinde daha iyi öğrenir." },
  { category: "economy", en: "Raising the minimum wage always increases unemployment.", tr: "Asgari ücreti artırmak her zaman işsizliği artırır." },
];
