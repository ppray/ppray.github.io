#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
按 git 跟踪口径重建 dist/（Cloudflare Pages 构建输出目录，见 wrangler.toml）。

用途：dist/ 被 .gitignore 排除、靠手工拷贝维护，历史上出现过长期滞后。
本脚本把 git 跟踪的全部文件同步到 dist/，保证部署产物 == 仓库内容。

用法：
    python3 scripts/sync-dist.py            # 只同步，不删除多余文件
    python3 scripts/sync-dist.py --prune    # 同步并删除 dist/ 中不在仓库里的多余文件
    python3 scripts/sync-dist.py --dry-run  # 只报告差异，不写盘（可与 --prune 组合）
"""
import os
import shutil
import subprocess
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DIST = os.path.join(ROOT, "dist")


def tracked_files():
    out = subprocess.run(
        ["git", "ls-files", "-z"], cwd=ROOT, capture_output=True, check=True
    ).stdout.decode("utf-8")
    return [p for p in out.split("\0") if p]


def main():
    prune = "--prune" in sys.argv
    dry = "--dry-run" in sys.argv

    files = tracked_files()
    updated = added = 0
    for rel in files:
        src = os.path.join(ROOT, rel)
        dst = os.path.join(DIST, rel)
        if not os.path.exists(src):
            continue
        need = False
        if not os.path.exists(dst):
            need = True
            added += 1
        elif os.path.getsize(src) != os.path.getsize(dst) or int(
            os.path.getmtime(src)
        ) > int(os.path.getmtime(dst)):
            need = True
            updated += 1
        if need and not dry:
            os.makedirs(os.path.dirname(dst), exist_ok=True)
            shutil.copy2(src, dst)

    # dist/ 中的多余文件（不在 git 跟踪清单里）
    tracked = set(files)
    extra = []
    for dirpath, dirnames, filenames in os.walk(DIST):
        for name in filenames:
            full = os.path.join(dirpath, name)
            rel = os.path.relpath(full, DIST)
            if rel not in tracked:
                extra.append(rel)

    print(f"仓库跟踪文件: {len(files)}")
    print(f"本次新增: {added} / 更新: {updated}" + ("（dry-run，未写盘）" if dry else ""))
    print(f"dist/ 中不在仓库的文件: {len(extra)}")
    for rel in extra[:20]:
        print("   -", rel)
    if len(extra) > 20:
        print(f"   ... 其余 {len(extra) - 20} 个省略")

    if prune and extra:
        if dry:
            print("--prune 会删除上述多余文件（本次为 dry-run，未删除）")
        else:
            for rel in extra:
                os.remove(os.path.join(DIST, rel))
            print(f"已删除多余文件 {len(extra)} 个")


if __name__ == "__main__":
    main()
