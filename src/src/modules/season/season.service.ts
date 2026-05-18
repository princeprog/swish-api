import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import type { Kysely } from 'kysely';
import { DB } from 'src/database/db';
import { CreateSeasonDto } from './dto/create-season.dto';
import { getUserLeagueMembership } from '../league/league-membership';

@Injectable()
export class SeasonService {
  private readonly allowedPlayoffFormats = new Set([
    'single_elimination',
    'double_elimination',
    'round_robin_finals',
    'twice_to_beat',
    'best_of_three',
    'best_of_five',
    'best_of_seven',
    'stepladder',
  ]);

  constructor(@Inject('KYSELY_DB') private readonly db: Kysely<DB>) {}

  async create(createSeasonDto: CreateSeasonDto, userId: string) {
    const membership = await getUserLeagueMembership(this.db, userId);

    if (!membership) {
      throw new UnauthorizedException('User has no league configured yet.');
    }

    this.validateSeasonInput(createSeasonDto);

    // 2. Insert season
    const season = await this.db
      .insertInto('league.Season')
      .values({
        league_id: membership.league_id,
        name: createSeasonDto.name,
        start_date: createSeasonDto.start_date as any,
        end_date: createSeasonDto.end_date as any,
        playoff_format: createSeasonDto.playoff_format,
        status: 1 as any, // 1 = Active / Draft
      })
      .returningAll()
      .executeTakeFirstOrThrow();

    return {
      success: true,
      season,
    };
  }

  async findForLeague(userId: string) {
    const membership = await getUserLeagueMembership(this.db, userId);

    if (!membership) {
      return [];
    }

    return this.db
      .selectFrom('league.Season')
      .selectAll()
      .where('league_id', '=', membership.league_id)
      .orderBy('start_date', 'desc')
      .execute();
  }

  async findOne(id: number, userId: string) {
    const membership = await getUserLeagueMembership(this.db, userId);

    if (!membership) {
      throw new UnauthorizedException('User has no league configured.');
    }

    return this.db
      .selectFrom('league.Season')
      .selectAll()
      .where('id', '=', id)
      .where('league_id', '=', membership.league_id)
      .executeTakeFirst();
  }

  async archive(id: number, userId: string) {
    const membership = await getUserLeagueMembership(this.db, userId);

    if (!membership) {
      throw new ForbiddenException('Only league admins can archive seasons.');
    }

    if (membership.role !== 'league_admin') {
      throw new ForbiddenException('Only league admins can archive seasons.');
    }

    const season = await this.db
      .selectFrom('league.Season')
      .selectAll()
      .where('id', '=', id)
      .where('league_id', '=', membership.league_id)
      .executeTakeFirst();

    if (!season) {
      throw new NotFoundException('Season not found.');
    }

    if (Number(season.status) === 3) {
      throw new BadRequestException('Season is already archived.');
    }

    const updated = await this.db
      .updateTable('league.Season')
      .set({ status: 3 as any })
      .where('id', '=', id)
      .where('league_id', '=', membership.league_id)
      .returningAll()
      .executeTakeFirst();

    if (!updated) {
      throw new NotFoundException('Season not found.');
    }

    return {
      success: true,
      season: updated,
    };
  }

  private validateSeasonInput(dto: CreateSeasonDto) {
    if (!dto.name?.trim()) {
      throw new BadRequestException('Season name is required.');
    }

    const startDate = new Date(dto.start_date);
    const endDate = new Date(dto.end_date);

    if (Number.isNaN(startDate.getTime())) {
      throw new BadRequestException('start_date must be a valid date.');
    }

    if (Number.isNaN(endDate.getTime())) {
      throw new BadRequestException('end_date must be a valid date.');
    }

    if (startDate.getTime() > endDate.getTime()) {
      throw new BadRequestException('end_date must be on or after start_date.');
    }

    if (!this.allowedPlayoffFormats.has(dto.playoff_format)) {
      throw new BadRequestException('playoff_format is not supported.');
    }
  }
}
