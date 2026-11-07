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

const transcription = compose({ id: "transcription-strand-direction", name: "Transcription strand direction", category: "Molecular biology", description: "A short sequence example connects template reading with complementary RNA synthesis.", references: [biology("15-2-prokaryotic-transcription", "Transcription")], notes: "The DNA artwork is context; nucleotide letters and prime marks are conventional sequence notation. The displayed sequence is invented solely to illustrate complementarity and is not a known gene. RNA polymerase reads the template 3′ to 5′ and builds RNA 5′ to 3′. Promoters, transcription bubbles, enzyme structure, RNA processing and coding-frame implications are omitted. Legend colors identify DNA and RNA notation; the direction arrow denotes template reading and RNA synthesis, not a molecular conversion of DNA into RNA.", tags: ["transcription", "template strand", "RNA direction"] }, ({ document, add, text, asset, arrow, label, heading, note }) => {
  document.background = "#ffffff";
  Object.assign(document.objects[0], { name: "Figure title", fontSize: 50, height: 74, color: "#15241e" });
  Object.assign(document.objects[1], { name: "Figure subtitle", y: 117, fontSize: 25, height: 42, color: "#65716d" });

  const dna = asset("dna-double-helix", 95, 230, 315, 515, { name: "DNA context", groupId: "transcription-dna-context" });
  label("DNA context", dna, 151, 764, 260, 29, { name: "DNA context label", groupId: dna.groupId, color: "#263c36" });
  Object.assign(heading("DNA sequence notation", 470, 215, 880), { name: "Sequence heading", fontSize: 34, height: 55, color: "#263c36" });

  const strand = (name, sequence, y, color, groupId) => {
    add("shape", { name: `${name} chip`, groupId, x: 470, y, width: 300, height: 66, color });
    label(name, dna, 490, y + 11, 270, 29, { name: `${name} label`, groupId, bold: true, color: "#26332d" });
    return label(sequence, dna, 805, y + 2, 480, 42, { name: `${name} sequence`, groupId, bold: true, color: "#17251e" });
  };
  strand("Coding strand", "5′–ATG CCA TTT–3′", 305, "#e2efff", "transcription-coding-strand");
  const template = strand("Template strand", "3′–TAC GGT AAA–5′", 455, "#efe6fc", "transcription-template-strand");
  const rna = strand("RNA product", "5′–AUG CCA UUU–3′", 685, "#e1f2dc", "transcription-rna-product");
  arrow(template, rna, "right", "right", { name: "RNA synthesis direction", role: "rna-synthesis", color: "#315cbd", strokeWidth: 4 });
  text("Template read 3′ → 5′", 1320, 460, 225, 28, { name: "Template reading direction", color: "#6941a5", groupId: "transcription-directions" });
  text("RNA elongated 5′ → 3′", 1320, 685, 225, 28, { name: "RNA elongation direction", color: "#6941a5", groupId: "transcription-directions" });

  const legendGroup = "transcription-legend";
  add("shape", { name: "Legend background", groupId: legendGroup, x: 80, y: 840, width: 1440, height: 65, color: "#f5f7f6" });
  text("Legend", 105, 855, 125, 25, { name: "Legend title", groupId: legendGroup, bold: true, role: "notation-legend" });
  add("shape", { name: "DNA legend swatch", groupId: legendGroup, x: 255, y: 863, width: 49, height: 20, color: "#78aee6" });
  text("DNA (double-stranded)", 320, 857, 345, 22, { name: "DNA legend", groupId: legendGroup, role: "notation-legend" });
  add("shape", { name: "RNA legend swatch", groupId: legendGroup, x: 700, y: 863, width: 49, height: 20, color: "#9bcd89" });
  text("RNA (single-stranded)", 765, 857, 330, 22, { name: "RNA legend", groupId: legendGroup, role: "notation-legend" });
  add("arrow", { name: "Direction legend arrow", groupId: legendGroup, x: 1110, y: 875, width: 65, height: 1, color: "#315cbd", strokeWidth: 3 });
  text("Read / synthesis direction", 1195, 857, 305, 20, { name: "Sequence notation legend", groupId: legendGroup, role: "notation-legend" });
  note("Sequence example · RNA complements the template; U replaces T relative to the coding strand", 80, 915, 1440).name = "Sequence scope note";
});
// A new prepared composition gets a new identity; saved user documents keep their own version and objects.
transcription.version = 2;
transcription.document.id = "template-transcription-strand-direction-v2";
transcription.document.objects.find(object => object.role === "review-status").name = "Draft review status";

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

const crispr = compose({
  id: "crispr-cas9-editing",
  name: "CRISPR–Cas9 targeted DNA cleavage",
  category: "Molecular biology",
  description: "Guide RNA directs Cas9 to a PAM-adjacent DNA sequence to introduce a double-strand break for cellular repair.",
  references: [biology("17-1-biotechnology", "Biotechnology"), { title: "NHGRI · CRISPR Genome Editing Fact Sheet", url: "https://www.genome.gov/about-genomics/fact-sheets/CRISPR-Genome-Editing-Fact-Sheet" }],
  notes: "CRISPR plasmid, Cas9–gRNA and damaged-DNA icons are schematic context illustrations rather than atomic models. Cas9 cleavage requires both guide-RNA complementarity and a protospacer-adjacent motif (PAM). Cellular repair pathways (NHEJ versus HDR), off-target effects and delivery mechanics are simplified.",
  tags: ["CRISPR", "Cas9", "genome editing", "guide RNA", "double-strand break"],
}, ({ text, asset, arrow, label, heading, note }) => {
  const plasmid = asset("crispr-plasmid", 80, 260, 280, 280);
  const cas9 = asset("crispr-cas9", 560, 250, 340, 290);
  const breakSite = asset("damaged-dna", 1120, 260, 320, 280);
  label("Expression construct\nCas9 + guide RNA", plasmid, 70, 580, 380);
  label("Cas9–guide RNA complex\nPAM-dependent target binding", cas9, 535, 580, 440);
  label("Targeted double-strand break\nTriggers host DNA repair", breakSite, 1080, 580, 440);
  heading("Cellular DNA repair outcomes", 535, 700, 960);
  const nhej = text("Non-homologous end joining\nError-prone indels can disrupt gene", 80, 755, 650, 25, { bold: true });
  const hdr = text("Homology-directed repair\nDonor template enables precise edit", 830, 755, 680, 25, { bold: true, color: "#537e76" });
  arrow(plasmid, cas9);
  arrow(cas9, breakSite, "right", "left", { role: "cas9-cleavage" });
  arrow(breakSite, nhej);
  arrow(breakSite, hdr);
  note("Genome-editing overview · Cas9 cuts DNA; the host cell's repair machinery determines the final sequence change", 80, 885, 1440);
});

const looping = compose({
  id: "enhancer-promoter-looping",
  name: "Enhancer–promoter chromatin looping",
  category: "Gene regulation",
  description: "Distal enhancers bound by transcription factors loop in 3D chromatin space to regulate transcription initiation.",
  references: [biology("16-4-eukaryotic-transcription-gene-regulation", "Eukaryotic transcription gene regulation")],
  notes: "Chromatin-domain and promoter–enhancer loop illustrations depict topological proximity rather than a fixed nucleotide scale. Mediator, cohesin, CTCF boundary elements and polymerase phosphorylation steps are omitted.",
  tags: ["enhancer", "promoter", "chromatin loop", "transcription factor"],
}, ({ text, asset, arrow, label, heading, note }) => {
  heading("3D chromatin domain", 85, 190, 480);
  heading("Enhancer–promoter contact", 640, 190, 520);
  const domain = asset("chromatin-domain", 100, 270, 360, 290);
  const loop = asset("promoter-enhancer-loop-tf", 660, 265, 380, 300);
  label("Chromatin domain context\nDistal regulatory elements", domain, 80, 600, 440);
  label("Enhancer loop with bound factors\nBrings activator near promoter", loop, 620, 600, 480);
  const linear = text("Linear DNA separates enhancer\nand core promoter by kilobases", 80, 745, 480, 25, { bold: true });
  const contact = text("Chromatin looping aligns bound\nactivators with the promoter", 620, 745, 480, 25, { bold: true, color: "#537e76" });
  const output = text("Stabilizes transcription\ninitiation machinery\nat target gene", 1150, 400, 370, 26, { bold: true });
  arrow(domain, loop);
  arrow(linear, contact);
  arrow(loop, output);
  note("Eukaryotic gene-regulation overview · Insulators and topologically associating domains constrain which enhancers interact", 80, 885, 1440);
});

const mutagenesis = compose({
  id: "dna-damage-mutagenesis",
  name: "DNA lesions versus heritable SNPs",
  category: "Genetics",
  description: "Distinguish a primary chemical DNA lesion from a repaired duplex or a fixed single-nucleotide polymorphism.",
  references: [biology("14-6-dna-repair", "DNA repair"), biology("17-2-mapping-genomes", "Single-nucleotide polymorphisms")],
  notes: "Damaged-DNA, intact double-helix and SNP illustrations are conceptual schematics, not atomic base-pair structures. A DNA lesion is an acute physical or chemical alteration; a mutation or SNP is a heritable base-pair change that remains in undamaged double-stranded DNA after replication. Specific excision enzymes and population allele frequencies are omitted.",
  tags: ["DNA damage", "mutation", "SNP", "DNA repair"],
}, ({ text, asset, arrow, label, heading, note }) => {
  const lesion = asset("damaged-dna", 85, 275, 320, 280);
  const intact = asset("dna-double-helix", 620, 250, 280, 310);
  const snp = asset("snp", 1120, 275, 320, 280);
  label("Primary DNA lesion\nUnrepaired strand or base damage", lesion, 75, 600, 430);
  label("Accurate DNA repair\nRestores original sequence", intact, 580, 600, 410);
  label("Fixed sequence variant (SNP)\nUndamaged altered base pair", snp, 1080, 600, 440);
  heading("Repair versus fixation during replication", 75, 190, 900);
  const lesionText = text("Chemical/UV/oxidative lesion\nrecognized by repair enzymes", 75, 735, 430, 25, { bold: true });
  const repairedText = text("Excision or resynthesis\nprevents mutation", 580, 735, 410, 25, { bold: true, color: "#537e76" });
  const snpText = text("Unrepaired or mispaired change\nbecomes heritable after replication", 1070, 735, 450, 25, { bold: true, color: "#9c7050" });
  arrow(lesion, intact, "right", "left", { role: "accurate-repair" });
  arrow(lesionText, repairedText);
  arrow(lesionText, snpText);
  note("Conceptual distinction · Once fixed as a standard base pair, a SNP is no longer recognized as damaged DNA", 80, 885, 1440);
});

export const geneticInformationTemplates = [chromatin, transcription, processing, decoding, coupling, regulation, crispr, looping, mutagenesis];
