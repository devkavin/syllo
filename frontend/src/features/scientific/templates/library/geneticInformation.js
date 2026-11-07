import { biology, compose } from "./compose";

const chromatin = compose({ id: "chromatin-accessibility", name: "Chromatin accessibility and transcription", category: "Gene regulation", description: "DNA packaging provides a regulatory checkpoint before a gene can be transcribed.", references: [biology("16-3-eukaryotic-epigenetic-gene-regulation", "Epigenetic gene regulation")], notes: "The source histone-complex drawing is a structural example, not two experimentally measured chromatin states. Text contrasts accessibility without inventing closed/open molecular conformations. Histone acetylation is generally associated with accessibility but is not a universal on/off switch. Specific marks, remodelers, methylation context and inheritance mechanisms are omitted.", tags: ["chromatin", "histone", "epigenetics"] }, ({ text, asset, arrow, label, heading, note }) => {
  const histone = asset("histone-complex", 610, 240, 370, 340); label("DNA–histone organization\nStructural context", histone, 555, 625, 520, 24);
  heading("Restricted access", 80, 245, 460); heading("Increased access", 1090, 245, 450);
  const compact = text("Transcription machinery\nhas less access to DNA", 80, 365, 450, 27, { bold: true });
  const accessible = text("Regulatory proteins can\nreach exposed DNA sites", 1090, 365, 440, 27, { bold: true });
  arrow(compact, histone); arrow(histone, accessible);
  text("Nucleosome positioning\nand histone modifications\nhelp regulate accessibility", 90, 675, 460, 25);
  const transcription = text("Transcriptional response\nrequires additional factors", 1080, 680, 450, 25, { bold: true }); arrow(accessible, transcription, "bottom", "top");
  note("Regulatory relationship diagram · Greater accessibility permits transcription; it does not guarantee it", 90, 860, 1430);
});

const transcription = compose({ id: "transcription-strand-direction", name: "Transcription strand direction", category: "Molecular biology", description: "A short sequence example connects template reading with complementary RNA synthesis.", references: [biology("15-2-prokaryotic-transcription", "Transcription")], notes: "The DNA artwork is context; nucleotide letters and prime marks are conventional sequence notation. The displayed sequence is invented solely to illustrate complementarity and is not a known gene. RNA polymerase reads the template 3′ to 5′ and builds RNA 5′ to 3′. Promoters, transcription bubbles, enzyme structure, RNA processing and coding-frame implications are omitted.", tags: ["transcription", "template strand", "RNA direction"] }, ({ text, asset, arrow, label, heading, note }) => {
  const dna = asset("dna-double-helix", 80, 245, 300, 400); label("DNA context", dna, 90, 700, 340);
  heading("DNA sequence notation", 540, 200, 800);
  text("Coding strand     5′–ATG CCA TTT–3′", 540, 300, 940, 29, { bold: true });
  const template = text("Template strand   3′–TAC GGT AAA–5′", 540, 425, 960, 29, { bold: true });
  const rna = text("RNA product       5′–AUG CCA UUU–3′", 540, 690, 960, 29, { bold: true, color: "#537e76" });
  arrow(template, rna, "bottom", "top", { role: "rna-synthesis" });
  text("Template read 3′ → 5′\nRNA elongated 5′ → 3′", 1100, 530, 420, 25, { color: "#9c7050" });
  note("Sequence example · RNA is complementary to the template and matches the coding strand with U replacing T", 90, 860, 1430);
});

const processing = compose({ id: "eukaryotic-mrna-processing", name: "Eukaryotic mRNA maturation", category: "Molecular biology", description: "Separate splicing and terminal processing from the nuclear export of a mature transcript.", references: [biology("15-4-rna-processing-in-eukaryotes", "RNA processing")], notes: "Exon/intron names and terminal marks are editable sequence notation rather than physical RNA structures. Processing events can occur co-transcriptionally and are not forced into a universal strict temporal order here. Most canonical nuclear protein-coding transcripts are the context; exceptions such as non-polyadenylated histone mRNAs are omitted. Exons can include untranslated regions. Spliceosome structure and alternative splicing are omitted.", tags: ["splicing", "5 prime cap", "poly-A"] }, ({ text, asset, arrow, label, heading, note }) => {
  const nucleus = asset("nucleus", 90, 290, 330, 310); label("Nuclear context", nucleus, 90, 650, 370);
  heading("Pre-mRNA", 530, 190, 850);
  const pre = text("5′  Exon 1 | Intron | Exon 2 | Intron | Exon 3  3′", 530, 290, 980, 26, { bold: true });
  const mature = text("5′ cap — Exon 1 | Exon 2 | Exon 3 — poly(A) 3′", 530, 595, 1000, 26, { bold: true, color: "#537e76" });
  arrow(pre, mature, "bottom", "top", { role: "rna-processing" });
  text("Introns removed; exons joined\n5′ capping and 3′ cleavage/polyadenylation", 540, 400, 440, 24);
  const exportRNA = text("Mature messenger ribonucleoprotein\nExport through nuclear pore", 690, 770, 750, 26, { bold: true }); arrow(mature, exportRNA, "bottom", "top");
  note("Processing relationships · Not a physical RNA map or a fixed order of all processing events", 90, 890, 1430);
});

const decoding = compose({ id: "codon-anticodon-decoding", name: "Codon and anticodon decoding", category: "Molecular biology", description: "Antiparallel base pairing links an mRNA codon to an amino acid carried by tRNA.", references: [biology("15-1-the-genetic-code", "The genetic code"), biology("15-5-ribosomes-and-protein-synthesis", "Ribosomes and protein synthesis")], notes: "The tRNA source is a generic secondary-structure example, not a methionine-specific atomic model. Codon/anticodon lettering is explicit nucleotide notation: mRNA 5′-AUG-3′ pairs with anticodon 3′-UAC-5′. Methionine is the standard-code example; bacterial initiator methionine is formylated. Aminoacyl-tRNA synthetases, wobble, release factors and ribosomal A/P/E geometry are omitted.", tags: ["tRNA", "codon", "translation"] }, ({ text, asset, arrow, label, heading, note }) => {
  const trna = asset("transfer-rna", 115, 240, 330, 365); label("tRNA secondary structure\nGeneric artwork", trna, 70, 650, 490);
  const ribosome = asset("ribosome", 1150, 250, 340, 300); label("Ribosome context", ribosome, 1110, 190, 420);
  heading("Antiparallel pairing", 550, 200, 650);
  const anticodon = text("Anticodon  3′–U A C–5′", 550, 340, 600, 30, { bold: true });
  const codon = text("mRNA       5′–A U G–3′", 550, 490, 600, 30, { bold: true, color: "#537e76" });
  text("Base pairing: U–A · A–U · C–G", 550, 605, 640, 24);
  arrow(trna, anticodon); arrow(codon, ribosome);
  const aminoAcid = text("Methionine delivered by charged tRNA\nPeptide grows from N terminus toward C terminus", 550, 760, 960, 26, { bold: true }); arrow(ribosome, aminoAcid, "bottom", "top");
  note("Standard genetic code example · Letters are sequence notation; the artwork does not encode this exact sequence", 90, 890, 1430);
});

const coupling = compose({ id: "bacterial-expression-coupling", name: "Coupled bacterial gene expression", category: "Microbiology", description: "A bacterial ribosome can translate a nascent RNA while its transcription is still in progress.", references: [biology("15-2-prokaryotic-transcription", "Bacterial transcription"), biology("15-5-ribosomes-and-protein-synthesis", "Translation")], notes: "Authentic bacterial ribosome–mRNA artwork is used without assigning unsupported A/P/E sites. Text and arrows describe a temporal relationship, not a transcription complex assembled from generic shapes. Coupling is common in bacteria but is not a universal condition for every bacterial transcript. There is no nuclear envelope separating the processes. Regulatory pauses, RNA decay, termination and spatial organization are omitted.", tags: ["bacteria", "transcription", "translation coupling"] }, ({ text, asset, arrow, label, heading, note }) => {
  const bacterium = asset("bacterium", 75, 260, 360, 290); label("Bacterial cell context", bacterium, 65, 605, 460);
  const translation = asset("bacterial-ribosome-mrna", 600, 285, 880, 300); label("Licensed bacterial ribosome–mRNA schematic", translation, 590, 630, 940, 25);
  heading("Overlapping processes in the cytoplasm", 570, 185, 950);
  const transcription = text("RNA polymerase extends\nthe 3′ end of nascent RNA", 80, 755, 580, 26, { bold: true });
  const ribosome = text("Ribosome reads an already\nexposed 5′ region of that RNA", 930, 755, 590, 26, { bold: true });
  arrow(transcription, ribosome, "right", "left", { role: "temporal-coupling" });
  note("Temporal coupling · A ribosome can start before RNA synthesis ends; no RNA processing/export step is implied", 90, 885, 1440);
});

const regulation = compose({ id: "transcription-factor-regulation", name: "Transcription-factor control", category: "Gene regulation", description: "A DNA-binding regulator affects transcription through interactions with the transcription machinery.", references: [biology("16-4-eukaryotic-transcription-gene-regulation", "Transcription gene regulation")], notes: "Zinc-finger artwork is an example DNA-binding fold, not a named signaling protein or a universal transcription factor. It is not asserted to be the product or ligand of any depicted pathway. Arrows represent regulatory relationships rather than conversion of protein into DNA. Enhancer looping, factor occupancy, general factors and chromatin context are omitted; activators and repressors are not assigned to specific molecules.", tags: ["transcription factor", "zinc finger", "gene regulation"] }, ({ text, asset, arrow, label, heading, note }) => {
  const factor = asset("zinc-finger-protein", 90, 285, 370, 310); label("Example DNA-binding protein fold", factor, 65, 640, 560);
  const dna = asset("dna-double-helix", 1180, 285, 280, 330); label("DNA context", dna, 1170, 660, 370);
  heading("Regulatory DNA binding", 550, 210, 650);
  const binding = text("Sequence-specific regulator\noccupies its DNA binding site", 550, 330, 560, 28, { bold: true });
  const machinery = text("Interactions influence\ntranscription initiation", 550, 575, 560, 28, { bold: true });
  arrow(factor, binding); arrow(binding, dna); arrow(binding, machinery, "bottom", "top");
  text("Context-dependent increase or decrease\nin production of the target RNA", 550, 760, 900, 25, { color: "#537e76" });
  note("Regulatory overview · DNA-binding alone does not establish whether a protein activates or represses a gene", 90, 885, 1430);
});

export const geneticInformationTemplates = [chromatin, transcription, processing, decoding, coupling, regulation];
