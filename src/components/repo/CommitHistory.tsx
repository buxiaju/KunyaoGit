import { useRepoStore } from '../../stores/repo';
import { formatDistanceToNow } from 'date-fns';
import { zhCN } from 'date-fns/locale';
import { GitCommit, Tag } from 'lucide-react';

export default function CommitHistory() {
  const log = useRepoStore((s) => s.log);

  if (log.length === 0) {
    return <div className="h-full flex items-center justify-center text-gray-500 text-sm">暂无提交</div>;
  }

  return (
    <div className="h-full overflow-auto p-4">
      <div className="max-w-3xl mx-auto">
        {log.map((c, i) => (
          <div key={c.hash} className="flex gap-3 group">
            {/* 时间线 */}
            <div className="flex flex-col items-center pt-1">
              <div className="w-2.5 h-2.5 rounded-full bg-primary-500 ring-2 ring-gray-900" />
              {i < log.length - 1 && <div className="w-px flex-1 bg-gray-700 my-1" />}
            </div>
            {/* 内容 */}
            <div className="flex-1 pb-5">
              <div className="text-sm font-medium break-words">{c.message.split('\n')[0]}</div>
              <div className="text-xs text-gray-500 mt-0.5 flex items-center gap-2 flex-wrap">
                <span className="text-primary-400 font-mono">{c.shortHash}</span>
                <span>{c.author}</span>
                <span>{formatDistanceToNow(new Date(c.date), { locale: zhCN, addSuffix: true })}</span>
                {c.refs?.filter((r) => r.includes('tag:') || r.includes('HEAD')).map((r) => (
                  <span key={r} className="px-1.5 py-0.5 bg-amber-900/40 text-amber-300 rounded text-[10px] flex items-center gap-1">
                    <Tag size={9} /> {r.replace('tag: ', '')}
                  </span>
                ))}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
