'use client'

import { CheckCircle, Circle } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { PipelineStage } from '@/lib/actions'

interface PipelineProps {
  stages: PipelineStage[]
  compact?: boolean
}

export function Pipeline({ stages, compact = false }: PipelineProps) {
  const nodeSize = compact ? 'w-5 h-5' : 'w-7 h-7'
  const iconSize = compact ? 'h-3 w-3' : 'h-4 w-4'

  return (
    <div className="flex items-center w-full">
      {stages.map((stage, i) => (
        <div key={stage.key} className="flex items-center flex-1 last:flex-none">
          <div className={cn('flex flex-col items-center', !compact && 'gap-1.5')}>
            <div
              className={cn(
                'rounded-full flex items-center justify-center shrink-0',
                nodeSize,
                stage.bereikt
                  ? 'bg-primary text-white'
                  : 'bg-gray-200 text-gray-400',
                stage.actief && 'ring-2 ring-primary ring-offset-2'
              )}
            >
              {stage.bereikt ? (
                <CheckCircle className={iconSize} />
              ) : (
                <Circle className={iconSize} />
              )}
            </div>
            {!compact && (
              <span
                className={cn(
                  'text-[10px] leading-tight text-center whitespace-nowrap',
                  stage.bereikt ? 'text-gray-900 font-medium' : 'text-gray-400'
                )}
              >
                {stage.label}
              </span>
            )}
          </div>
          {i < stages.length - 1 && (
            <div
              className={cn(
                'flex-1 h-px mx-1',
                stages[i + 1].bereikt ? 'bg-primary' : 'bg-gray-200'
              )}
            />
          )}
        </div>
      ))}
    </div>
  )
}
