import { membraneAndCellTemplates } from "./library/membranesAndCells";
import { geneticInformationTemplates } from "./library/geneticInformation";
import { metabolismTemplates } from "./library/metabolism";
import { physiologyTemplates } from "./library/physiology";
import { experimentalTemplates } from "./library/experimentalWorkflows";

export const libraryTemplates = [...membraneAndCellTemplates, ...geneticInformationTemplates, ...metabolismTemplates, ...physiologyTemplates, ...experimentalTemplates];
