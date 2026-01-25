import { CreateSectionDto } from './create-section.dto';
import { CreateContentDto } from './create-content.dto';
import { CreateContentFileDto } from './create-content-file.dto';

export type LessonToAdd = Omit<CreateContentDto, 'course_id' | 'files'> & {
  type: string;           
  content: string;      
  temp_id?: string;  
  files?: CreateContentFileDto[]; 
};

export type SectionToAdd = Omit<CreateSectionDto, 'course_id'> & {
  temp_id?: string | undefined;
  lessons?: LessonToAdd[] | undefined;
};


export interface AccumulatedChangeData {
  addSections?: SectionToAdd[];
  addContents?: LessonToAdd[];
  updateSections?: Record<string, Partial<CreateSectionDto>>;
  updateContents?: Record<string, Partial<CreateContentDto>>;
  bulkAddSections?: SectionToAdd[];
}