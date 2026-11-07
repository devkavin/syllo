import { membraneAndCellTemplates } from "./library/membranesAndCells";
import { geneticInformationTemplates } from "./library/geneticInformation";
import { metabolismTemplates } from "./library/metabolism";
import { physiologyTemplates } from "./library/physiology";
import { experimentalTemplates } from "./library/experimentalWorkflows";
import { immunologyAndDevelopmentTemplates } from "./library/immunologyAndDevelopment";

export const libraryTemplates = [
  ...membraneAndCellTemplates,
  ...geneticInformationTemplates,
  ...metabolismTemplates,
  ...physiologyTemplates,
  ...experimentalTemplates,
  ...immunologyAndDevelopmentTemplates,
];
