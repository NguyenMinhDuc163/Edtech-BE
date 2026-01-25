import { Injectable, ConflictException, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { SystemParameter } from '../schema/entities/system-parameter.entity';
import { SystemParameterItemDto } from '../schema/dtos/create-system-parameter.dto';
import { UpdateSystemParameterItemDto } from '../schema/dtos/update-system-parameter.dto';

@Injectable()
export class SystemParameterService {
  private cache = new Map<string, { value: string; timestamp: number }>();
  private readonly CACHE_TTL = 5 * 60 * 1000;

  constructor(
    @InjectRepository(SystemParameter)
    private readonly paramRepo: Repository<SystemParameter>,
  ) {}

  async getValue(key: string, defaultValue: string, skipCache = false): Promise<string> {
    if (!skipCache) {
      const cached = this.cache.get(key);
      const now = Date.now();

      if (cached && now - cached.timestamp < this.CACHE_TTL) {
        return cached.value;
      }
    }

    const param = await this.paramRepo.findOne({ where: { param_key: key } });
    const value = param?.param_value || defaultValue;

    if (!skipCache) {
      this.cache.set(key, { value, timestamp: Date.now() });
    }

    return value;
  }

  async getNumber(key: string, defaultValue: number): Promise<number> {
    const value = await this.getValue(key, String(defaultValue));
    const parsed = parseInt(value, 10);
    return isNaN(parsed) ? defaultValue : parsed;
  }

  clearCache(key?: string): void {
    if (key) {
      this.cache.delete(key);
    } else {
      this.cache.clear();
    }
  }

  async getAll(page: number = 1, limit: number = 20): Promise<{ data: SystemParameter[], total: number, page: number, limit: number, totalPages: number }> {
    const skip = (page - 1) * limit;

    const [data, total] = await this.paramRepo.findAndCount({
      order: { param_key: 'ASC' },
      skip,
      take: limit,
    });

    const totalPages = Math.ceil(total / limit);

    return { data, total, page, limit, totalPages };
  }

  async createBulk(items: SystemParameterItemDto[]): Promise<{ success: SystemParameter[], errors: any[] }> {
    const success: SystemParameter[] = [];
    const errors: any[] = [];

    for (const item of items) {
      try {
        const existing = await this.paramRepo.findOne({ where: { param_key: item.param_key } });
        if (existing) {
          errors.push({ param_key: item.param_key, error: 'Khóa tham số đã tồn tại' });
          continue;
        }

        const param = this.paramRepo.create(item);
        const saved = await this.paramRepo.save(param);
        success.push(saved);
        this.clearCache(item.param_key);
      } catch (error: any) {
        errors.push({ param_key: item.param_key, error: error.message || 'Lỗi không xác định' });
      }
    }

    return { success, errors };
  }

  async updateBulk(items: UpdateSystemParameterItemDto[]): Promise<{ success: SystemParameter[], errors: any[] }> {
    const success: SystemParameter[] = [];
    const errors: any[] = [];

    for (const item of items) {
      try {
        const existing = await this.paramRepo.findOne({ where: { param_id: item.param_id } });
        if (!existing) {
          errors.push({ param_id: item.param_id, error: 'Tham số không tồn tại' });
          continue;
        }

        if (item.param_key !== undefined) {
          existing.param_key = item.param_key;
        }
        if (item.param_value !== undefined) {
          existing.param_value = item.param_value;
        }
        if (item.description !== undefined) {
          existing.description = item.description;
        }
        if (item.function_name !== undefined) {
          existing.function_name = item.function_name;
        }

        const saved = await this.paramRepo.save(existing);
        success.push(saved);
        this.clearCache(existing.param_key);
      } catch (error: any) {
        errors.push({ param_id: item.param_id, error: error.message || 'Lỗi không xác định' });
      }
    }

    return { success, errors };
  }

  async deleteBulk(paramIds: string[]): Promise<{ success: string[], errors: any[] }> {
    const success: string[] = [];
    const errors: any[] = [];

    for (const id of paramIds) {
      try {
        const existing = await this.paramRepo.findOne({ where: { param_id: id } });
        if (!existing) {
          errors.push({ param_id: id, error: 'Tham số không tồn tại' });
          continue;
        }

        const paramKey = existing.param_key;
        await this.paramRepo.remove(existing);
        success.push(id);
        this.clearCache(paramKey);
      } catch (error: any) {
        errors.push({ param_id: id, error: error.message || 'Lỗi không xác định' });
      }
    }

    return { success, errors };
  }
}
