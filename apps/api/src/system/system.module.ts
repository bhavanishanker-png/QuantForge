import { Module } from '@nestjs/common';
import { JobsModule } from '../jobs/jobs.module.js';
import { SystemController } from './system.controller.js';

@Module({ imports: [JobsModule], controllers: [SystemController] })
export class SystemModule {}
