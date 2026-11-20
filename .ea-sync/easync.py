#!/usr/bin/env python3
# easync.py - helper del skill ea-github-sync (sincroniza t_script de Sparx EA <-> carpeta local)
# Se guarda en <cliente>/.ea-sync/easync.py. No habla con EA: genera SQL, verifica hashes y
# mantiene el manifiesto; Claude ejecuta el SQL con ea_analyze.execute_sql.
VERSION = "1"

import argparse, datetime, hashlib, json, os, re, sys, uuid
import xml.etree.ElementTree as ET

GROUP_CAT = "3955A83E-9E54-4810-8053-FACC68CD4782"
SCRIPT_CAT = "605A62F7-BCD0-4845-A8D0-7DC45B4D2E3F"
LANG_EXT = {"JScript": ".js", "JavaScript": ".js", "VBScript": ".vbs"}
EXT_LANG = {".js": "JScript", ".vbs": "VBScript"}
BAD = set('<>:"/\\|?*%')
DIALECTS = ("SQLSVR", "ORACLE", "POSTGRES")
HASH_MODES = ("utf16le", "utf8", "md5utf8", "none")


def out(obj, ascii_only=False):
    sys.stdout.write(json.dumps(obj, ensure_ascii=ascii_only, indent=1) + "\n")


def die(msg, code=1, **extra):
    d = {"error": msg}
    d.update(extra)
    out(d)
    sys.exit(code)


# ---------- nombres ----------
def enc_name(n):
    s = "".join("%%%02X" % ord(c) if (c in BAD or ord(c) < 32) else c for c in n)
    if s and s[-1] in ". ":
        s = s[:-1] + "%%%02X" % ord(s[-1])
    return s or "_sin_nombre"


def dec_name(s):
    return re.sub(r"%([0-9A-Fa-f]{2})", lambda m: chr(int(m.group(1), 16)), s)


def xml_attr(s):
    return (s.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")
             .replace('"', "&quot;"))


def parse_attrs(notes):
    try:
        return dict(ET.fromstring(notes or "").attrib)
    except Exception:
        return {}


def set_name_attr(notes, name):
    new, n = re.subn(r'Name="[^"]*"', lambda _m: 'Name="%s"' % xml_attr(name), notes, count=1)
    return new if n else notes


# ---------- hashes ----------
def dbhash(text, mode):
    if mode == "utf16le":
        return hashlib.sha256(text.encode("utf-16-le")).hexdigest().upper()
    if mode == "md5utf8":
        return hashlib.md5(text.encode("utf-8")).hexdigest().upper()
    return hashlib.sha256(text.encode("utf-8")).hexdigest().upper()  # utf8 y none


def u16len(text):
    return len(text.encode("utf-16-le")) // 2


# ---------- archivos ----------
def P(root, *parts):
    return os.path.join(root, *parts)


def read_text(path):
    b = open(path, "rb").read()
    if b.startswith(b"\xef\xbb\xbf"):
        b = b[3:]
    return b.decode("utf-8")


def write_text(path, text):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "wb") as f:
        f.write(text.encode("utf-8"))


def load_manifest(root, required=True):
    p = P(root, ".ea-sync", "manifest.json")
    if not os.path.exists(p):
        if required:
            die("No hay manifiesto: ejecuta primero una bajada inicial (init + pull).", 2)
        return None
    return json.load(open(p, encoding="utf-8"))


def save_manifest(root, m):
    p = P(root, ".ea-sync", "manifest.json")
    os.makedirs(os.path.dirname(p), exist_ok=True)
    with open(p, "w", encoding="utf-8", newline="\n") as f:
        json.dump(m, f, ensure_ascii=False, indent=1, sort_keys=True)
        f.write("\n")


def now():
    return datetime.datetime.now().replace(microsecond=0).isoformat()


def ensure_lines(path, lines):
    have = open(path, encoding="utf-8").read().splitlines() if os.path.exists(path) else []
    add = [l for l in lines if l not in have]
    if add:
        with open(path, "a", encoding="utf-8", newline="\n") as f:
            if have and have[-1] != "":
                f.write("\n")
            f.write("\n".join(add) + "\n")


def scan_local(root):
    """Carpetas de primer nivel = grupos; archivos .js/.vbs dentro = scripts."""
    sd = P(root, "scripts")
    folders, files, warnings = set(), {}, []
    if not os.path.isdir(sd):
        return folders, files, warnings
    for d in sorted(os.listdir(sd)):
        full = P(sd, d)
        if d.startswith("."):
            continue
        if os.path.isfile(full):
            warnings.append("Archivo fuera de una carpeta (se ignora): scripts/" + d)
            continue
        folders.add(d)
        for f in sorted(os.listdir(full)):
            ff = P(full, f)
            if f.startswith("."):
                continue
            if os.path.isdir(ff):
                warnings.append("EA no tiene subcarpetas de scripts (se ignora): scripts/%s/%s" % (d, f))
                continue
            ext = os.path.splitext(f)[1].lower()
            if ext not in EXT_LANG:
                warnings.append("Extensión no soportada (se ignora): scripts/%s/%s" % (d, f))
                continue
            files[d + "/" + f] = ff
    return folders, files, warnings


# ---------- inventario ----------
def load_inventory(path, mode, inbox=None):
    rows = json.load(open(path, encoding="utf-8"))
    if isinstance(rows, dict) and "rows" in rows:
        rows = rows["rows"]
    groups, scripts, other = {}, {}, []
    texts = load_inbox(inbox) if inbox else {}
    for r in rows:
        r = {k.lower(): v for k, v in r.items()}
        cat = (r.get("cat") or "").strip()
        guid = r.get("guid")
        if cat == GROUP_CAT:
            a = parse_attrs(r.get("notes"))
            groups[guid] = {"name": r.get("gname") or "", "notes": r.get("notes") or "",
                            "type": a.get("Type", "NORMAL")}
        elif cat == SCRIPT_CAT:
            a = parse_attrs(r.get("notes"))
            ln = int(r.get("len") or 0)
            h = (r.get("h") or "").upper() or None
            if mode == "none":
                h = dbhash(texts[guid], mode) if guid in texts else None
            elif h is None and ln == 0:
                h = dbhash("", mode)
            scripts[guid] = {"name": a.get("Name", guid), "lang": a.get("Language", "JScript"),
                             "notes": r.get("notes") or "", "group": r.get("parent") or None,
                             "len": ln, "h": h}
        else:
            other.append(guid)
    return groups, scripts, other


def load_inbox(inbox):
    texts = {}
    if not inbox or not os.path.isdir(inbox):
        return texts
    chunks = {}
    for fn in sorted(os.listdir(inbox)):
        if not fn.endswith(".json"):
            continue
        data = json.load(open(P(inbox, fn), encoding="utf-8"))
        for g, v in data.items():
            if isinstance(v, dict):
                chunks.setdefault(g, {}).update({int(k): t for k, t in v.items()})
            else:
                texts[g] = v if v is not None else ""
    for g, parts in chunks.items():
        texts[g] = "".join(parts[k] for k in sorted(parts))
    return texts


def layout(groups, scripts):
    """Ruta local esperada para cada grupo/script de EA."""
    gfolder, used = {}, {}
    for g in sorted(groups, key=lambda x: groups[x]["name"].lower()):
        f = enc_name(groups[g]["name"])
        if f.lower() in used:
            f = "%s ~%s" % (f, g.strip("{}")[:8])
        used[f.lower()] = g
        gfolder[g] = f
    spath, orphans, usedp = {}, [], set()
    for s in sorted(scripts, key=lambda x: scripts[x]["name"].lower()):
        sc = scripts[s]
        if sc["group"] not in gfolder:
            orphans.append(s)
            continue
        ext = LANG_EXT.get(sc["lang"], ".js")
        stem = enc_name(sc["name"])
        p = "%s/%s%s" % (gfolder[sc["group"]], stem, ext)
        if p.lower() in usedp:
            p = "%s/%s ~%s%s" % (gfolder[sc["group"]], stem, s.strip("{}")[:8], ext)
        usedp.add(p.lower())
        spath[s] = p
    return gfolder, spath, orphans


# ---------- SQL por dialecto ----------
NV = "CAST('' AS nvarchar(max))"


def mssql_lit(s):
    """Literal Unicode para SQL Server SIN el prefijo N'' (el validador del MCP lo rechaza):
    ASCII como texto normal y cada carácter no ASCII como NCHAR(código UTF-16), anclado a
    nvarchar(max) para que la concatenación no se trunque en 4000."""
    parts, buf = [NV], []
    for ch in s:
        if ord(ch) < 128:
            buf.append(ch)
            continue
        if buf:
            parts.append("'%s'" % "".join(buf).replace("'", "''"))
            buf = []
        b = ch.encode("utf-16-le")
        for i in range(0, len(b), 2):
            parts.append("NCHAR(%d)" % (b[i] | (b[i + 1] << 8)))
    if buf:
        parts.append("'%s'" % "".join(buf).replace("'", "''"))
    return " + ".join(parts)


def lit(d, s):
    if s is None:
        return "NULL"
    if d == "SQLSVR":
        return mssql_lit(s)
    return "'%s'" % s.replace("'", "''")


def inventory_sql(d, mode):
    G, S = GROUP_CAT, SCRIPT_CAT
    if d == "SQLSVR":
        t = "COALESCE(CAST(Script AS nvarchar(max)), %s)" % NV
        h = "" if mode == "none" else ", CONVERT(varchar(64), HASHBYTES('SHA2_256', %s), 2) AS h" % t
        return ("SELECT ScriptID AS id, ScriptCategory AS cat, ScriptName AS guid, ScriptAuthor AS parent, "
                "Notes AS notes, CASE WHEN ScriptCategory = '%s' THEN %s END AS gname, "
                "DATALENGTH(%s)/2 AS len%s FROM t_script WHERE ScriptCategory IN ('%s','%s') ORDER BY ScriptID"
                % (G, t, t, h, G, S))
    if d == "POSTGRES":
        t = "coalesce(script, '')"
        h = {"utf8": ", upper(encode(sha256(convert_to(%s, 'UTF8')), 'hex')) AS h" % t,
             "md5utf8": ", upper(md5(%s)) AS h" % t}.get(mode, "")
        return ("SELECT scriptid AS id, scriptcategory AS cat, scriptname AS guid, scriptauthor AS parent, "
                "notes AS notes, CASE WHEN scriptcategory = '%s' THEN script END AS gname, "
                "length(%s) AS len%s FROM t_script WHERE scriptcategory IN ('%s','%s') ORDER BY scriptid"
                % (G, t, h, G, S))
    if d == "ORACLE":
        h = "" if mode == "none" else ", RAWTOHEX(DBMS_CRYPTO.HASH(Script, 4)) AS h"
        return ("SELECT ScriptID AS id, ScriptCategory AS cat, ScriptName AS guid, ScriptAuthor AS parent, "
                "Notes AS notes, CASE WHEN ScriptCategory = '%s' THEN DBMS_LOB.SUBSTR(Script, 255, 1) END AS gname, "
                "NVL(DBMS_LOB.GETLENGTH(Script), 0) AS len%s FROM t_script WHERE ScriptCategory IN ('%s','%s') "
                "ORDER BY ScriptID" % (G, h, G, S))
    die("Dialecto no soportado: " + d)


def fetch_sql(d, guids, start=None, n=None):
    ins = ", ".join("'%s'" % g for g in guids)
    if d == "SQLSVR":
        t = "COALESCE(CAST(Script AS nvarchar(max)), %s)" % NV
        expr = t if start is None else "SUBSTRING(%s, %d, %d)" % (t, start, n)
        return "SELECT ScriptName AS guid, %s AS txt FROM t_script WHERE ScriptName IN (%s)" % (expr, ins)
    if d == "POSTGRES":
        t = "coalesce(script, '')"
        expr = t if start is None else "substr(%s, %d, %d)" % (t, start, n)
        return "SELECT scriptname AS guid, %s AS txt FROM t_script WHERE scriptname IN (%s)" % (expr, ins)
    expr = "Script" if start is None else "DBMS_LOB.SUBSTR(Script, %d, %d)" % (min(n, 1000), start)
    return "SELECT ScriptName AS guid, %s AS txt FROM t_script WHERE ScriptName IN (%s)" % (expr, ins)


def content_sql(d, guid, text, chunk):
    w = " WHERE ScriptName = '%s' AND ScriptCategory = '%s'" % (guid, SCRIPT_CAT)
    if text == "":
        empty = {"SQLSVR": NV, "POSTGRES": "''", "ORACLE": "EMPTY_CLOB()"}[d]
        return ["UPDATE t_script SET Script = %s%s" % (empty, w)]
    if d == "ORACLE":
        size = min(chunk, 1000)
        parts = [text[i:i + size] for i in range(0, len(text), size)]
        stmts = []
        for i in range(0, len(parts), 4):
            expr = " || ".join("TO_CLOB(%s)" % lit(d, p) for p in parts[i:i + 4])
            stmts.append("UPDATE t_script SET Script = %s%s%s" % ("" if i == 0 else "Script || ", expr, w))
        return stmts
    parts = [text[i:i + chunk] for i in range(0, len(text), chunk)]
    stmts = []
    for i, p in enumerate(parts):
        if i == 0:
            stmts.append("UPDATE t_script SET Script = %s%s" % (lit(d, p), w))
        elif d == "SQLSVR":
            stmts.append("UPDATE t_script SET Script = CAST(Script AS nvarchar(max)) + %s%s" % (lit(d, p), w))
        else:
            stmts.append("UPDATE t_script SET Script = Script || %s%s" % (lit(d, p), w))
    return stmts


def new_guid():
    return "{%s}" % str(uuid.uuid4()).upper()


# ---------- comandos ----------
def cmd_init(a):
    if load_manifest(a.root, required=False) and not a.force:
        die("Ya existe .ea-sync/manifest.json (usa --force solo si sabes lo que haces).", 2)
    if a.dialect not in DIALECTS or a.hash_mode not in HASH_MODES:
        die("dialect/hash-mode inválido")
    conn = re.sub(r"(?i)(password|pwd)\s*=\s*[^;]*;?", "", a.connection or "")
    m = {"tool_version": VERSION, "client": a.client, "dialect": a.dialect, "hash_mode": a.hash_mode,
         "connection": conn, "fingerprint": sorted(json.loads(a.fingerprint)),
         "groups": {}, "scripts": {}, "last_pull": None, "last_push": None}
    save_manifest(a.root, m)
    os.makedirs(P(a.root, "scripts"), exist_ok=True)
    ensure_lines(P(a.root, ".gitattributes"), ["scripts/** -text", ".ea-sync/** -text"])
    ensure_lines(P(a.root, ".gitignore"), [".ea-sync/pending-push.json"])
    out({"ok": True, "manifest": m})


def cmd_check(a):
    m = load_manifest(a.root)
    fp = sorted(json.loads(a.fingerprint))
    same = fp == m["fingerprint"]
    out({"ok": same, "client": m["client"], "manifest_fingerprint": m["fingerprint"], "open_fingerprint": fp,
         "manifest_connection": m["connection"], "dialect": m["dialect"], "hash_mode": m["hash_mode"],
         "last_pull": m["last_pull"], "last_push": m["last_push"]})
    sys.exit(0 if same else 2)


def cmd_sql_inventory(a):
    m = load_manifest(a.root, required=False)
    d = a.dialect or (m and m["dialect"])
    mode = a.hash_mode or (m and m["hash_mode"])
    out({"sql": inventory_sql(d, mode)}, True)


def cmd_sql_fetch(a):
    m = load_manifest(a.root)
    out({"sql": fetch_sql(m["dialect"], a.guids, a.start, a.n)}, True)


def local_hash(path, mode):
    try:
        return dbhash(read_text(path), mode)
    except (OSError, UnicodeDecodeError):
        return None


def pull_plan(root, m, groups, scripts):
    mode = m["hash_mode"]
    gfolder, spath, orphans = layout(groups, scripts)
    folders, files, warns = scan_local(root)
    fetch, moves, unpushed, restored = [], [], [], []
    for g, sc in scripts.items():
        if g in orphans:
            continue
        old = m["scripts"].get(g)
        target = spath[g]
        src = None
        if old and old["path"] in files:
            src = old["path"]
        elif target in files:
            src = target
        lh = local_hash(files[src], mode) if src else None
        if old and src and lh != old["hash"]:
            unpushed.append(src)
        if old and not src:
            restored.append(target)
        if mode == "none" or sc["h"] is None or lh != sc["h"]:
            fetch.append(g)
        elif src != target:
            moves.append([src, target])
    keep = set(spath.values())
    move_src = {s for s, _ in moves}
    manifest_paths = {v["path"] for v in m["scripts"].values()}
    local_only = sorted(p for p in files if p not in keep and p not in manifest_paths)
    deleted_in_ea = sorted(m["scripts"][g]["path"] for g in m["scripts"] if g not in scripts)
    # archivos que se borran: los que no quedan en el layout final (los movidos no se borran)
    to_delete = sorted(p for p in files if p not in keep and p not in move_src)
    stale_folders = sorted(f for f in folders if f not in gfolder.values())
    batches, cur, size, big = [], [], 0, []
    for g in sorted(fetch, key=lambda x: scripts[x]["len"]):
        ln = scripts[g]["len"]
        if ln > 30000:
            big.append({"guid": g, "len": ln})
            continue
        if cur and size + ln > 40000:
            batches.append(cur)
            cur, size = [], 0
        cur.append(g)
        size += ln
    if cur:
        batches.append(cur)
    return {"gfolder": gfolder, "spath": spath, "orphans": orphans, "fetch": fetch, "batches": batches,
            "big": big, "moves": moves, "to_delete": to_delete, "stale_folders": stale_folders,
            "unpushed_local": sorted(set(unpushed)), "local_only": local_only, "deleted_in_ea": deleted_in_ea,
            "restored": restored, "warnings": warns}


def cmd_plan_pull(a):
    m = load_manifest(a.root)
    groups, scripts, other = load_inventory(a.inventory, m["hash_mode"])
    p = pull_plan(a.root, m, groups, scripts)
    out({"groups": len(groups), "scripts": len(scripts), "ignored_other_categories": other,
         "orphan_scripts": [scripts[g]["name"] for g in p["orphans"]],
         "fetch_count": len(p["fetch"]), "fetch_chars": sum(scripts[g]["len"] for g in p["fetch"]),
         "fetch_batches": p["batches"], "fetch_big_chunked": p["big"],
         "moves": p["moves"], "files_to_delete": p["to_delete"], "folders_to_remove": p["stale_folders"],
         "WARN_unpushed_local_changes": p["unpushed_local"], "WARN_local_only_files": p["local_only"],
         "deleted_in_ea": p["deleted_in_ea"], "restored_from_ea": p["restored"], "warnings": p["warnings"]})


def cmd_apply_pull(a):
    m = load_manifest(a.root)
    mode = m["hash_mode"]
    texts = load_inbox(a.inbox)
    groups, scripts, other = load_inventory(a.inventory, mode, a.inbox)
    p = pull_plan(a.root, m, groups, scripts)
    missing = [g for g in p["fetch"] if g not in texts]
    if missing:
        die("Falta el contenido de algunos scripts en el inbox.", 3, missing=missing)
    bad = []
    for g in p["fetch"]:
        t = texts[g]
        if mode != "none" and dbhash(t, mode) != scripts[g]["h"]:
            bad.append({"guid": g, "name": scripts[g]["name"], "expected": scripts[g]["h"],
                        "got": dbhash(t, mode), "len_expected": scripts[g]["len"], "len_got": u16len(t)})
        elif mode == "none" and m["dialect"] != "ORACLE" and u16len(t) != scripts[g]["len"]:
            bad.append({"guid": g, "name": scripts[g]["name"], "len_expected": scripts[g]["len"],
                        "len_got": u16len(t)})
    if bad:
        die("Verificación de hash fallida: no se escribió nada.", 3, mismatches=bad)
    sd = P(a.root, "scripts")
    res = {"written": [], "moved": [], "deleted": [], "folders_created": [], "folders_removed": [], "errors": []}
    for f in sorted(set(p["gfolder"].values())):
        if not os.path.isdir(P(sd, f)):
            os.makedirs(P(sd, f))
            res["folders_created"].append(f)
    for s, t in p["moves"]:
        os.replace(P(sd, s), P(sd, t))
        res["moved"].append([s, t])
    for g in p["fetch"]:
        write_text(P(sd, p["spath"][g]), texts[g])
        res["written"].append(p["spath"][g])
    for f in p["to_delete"]:
        try:
            os.remove(P(sd, f))
            res["deleted"].append(f)
        except OSError as e:
            res["errors"].append("No se pudo borrar %s: %s" % (f, e))
    used = {}
    for g in p["spath"]:
        used.setdefault(p["spath"][g].split("/")[0], 0)
        used[p["spath"][g].split("/")[0]] += 1
    for gid, f in p["gfolder"].items():
        if not used.get(f) and not os.path.exists(P(sd, f, ".gitkeep")):
            write_text(P(sd, f, ".gitkeep"), "")
    for f in p["stale_folders"]:
        try:
            rest = os.listdir(P(sd, f))
            if [x for x in rest if not x.startswith(".")]:
                res["errors"].append("La carpeta %s ya no existe en EA pero tiene otros archivos; no la borro" % f)
                continue
            for x in rest:
                os.remove(P(sd, f, x))
            os.rmdir(P(sd, f))
            res["folders_removed"].append(f)
        except OSError as e:
            res["errors"].append("No se pudo quitar la carpeta %s: %s" % (f, e))
    m["groups"] = {g: {"name": groups[g]["name"], "type": groups[g]["type"], "notes": groups[g]["notes"],
                       "folder": p["gfolder"][g]} for g in groups}
    ms = {}
    for g, sc in scripts.items():
        if g in p["orphans"]:
            continue
        path = p["spath"][g]
        txt = texts[g] if g in texts else read_text(P(sd, path))
        ms[g] = {"name": sc["name"], "lang": sc["lang"], "notes": sc["notes"], "group": sc["group"],
                 "path": path, "hash": sc["h"] if mode != "none" else dbhash(txt, mode),
                 "sha": dbhash(txt, "utf8")}
    m["scripts"] = ms
    m["last_pull"] = now()
    m["tool_version"] = VERSION
    save_manifest(a.root, m)
    res["orphans_skipped"] = [scripts[g]["name"] for g in p["orphans"]]
    out(res)
    sys.exit(4 if res["errors"] else 0)


def local_changes(root, m):
    mode = m["hash_mode"]
    folders, files, warns = scan_local(root)
    gby_folder = {v["folder"]: g for g, v in m["groups"].items()}
    # renombres de carpeta: carpeta del manifiesto ausente + carpeta nueva con el mismo set de archivos
    missing_g = [g for g, v in m["groups"].items() if v["folder"] not in folders]
    new_f = [f for f in folders if f not in gby_folder]
    remap, group_renames = {}, []
    for g in missing_g:
        old_f = m["groups"][g]["folder"]
        stems = sorted(v["path"].split("/", 1)[1] for v in m["scripts"].values() if v["group"] == g)
        for f in new_f:
            have = sorted(p.split("/", 1)[1] for p in files if p.split("/")[0] == f)
            if stems and have == stems:
                remap[old_f] = f
                group_renames.append({"guid": g, "from": old_f, "to": f})
                new_f.remove(f)
                break
    renamed_g = {r["guid"] for r in group_renames}
    folder_of = {g: remap.get(v["folder"], v["folder"]) for g, v in m["groups"].items()}
    gby_folder = {f: g for g, f in folder_of.items()}
    deleted_groups = [g for g in missing_g if g not in renamed_g]

    def cur_path(sc):
        f, rest = sc["path"].split("/", 1)
        return remap.get(f, f) + "/" + rest

    known = {}
    for g, sc in m["scripts"].items():
        known[cur_path(sc)] = g
    modified, missing, new_files = [], [], []
    for g, sc in m["scripts"].items():
        cp = cur_path(sc)
        if cp in files:
            h = local_hash(files[cp], mode)
            if h is None:
                warns.append("No se pudo leer como UTF-8: scripts/" + cp)
            elif h != sc["hash"]:
                modified.append(g)
        else:
            missing.append(g)
    for p in files:
        if p not in known:
            new_files.append(p)
    # renombres/movimientos de script: mismo contenido
    renames = []
    for g in list(missing):
        for p in list(new_files):
            try:
                same = dbhash(read_text(files[p]), "utf8") == m["scripts"][g]["sha"]
            except (OSError, UnicodeDecodeError):
                same = False
            if same:
                renames.append({"guid": g, "from": m["scripts"][g]["path"], "to": p})
                missing.remove(g)
                new_files.remove(p)
                break
    return {"files": files, "folders": folders, "folder_of": folder_of, "gby_folder": gby_folder,
            "new_folders": sorted(new_f), "group_renames": group_renames, "deleted_groups": deleted_groups,
            "modified": modified, "deleted": missing, "new_files": sorted(new_files), "renames": renames,
            "warnings": warns, "cur_path": cur_path}


def cmd_status(a):
    m = load_manifest(a.root)
    c = local_changes(a.root, m)
    out({"modified": [c["cur_path"](m["scripts"][g]) for g in c["modified"]],
         "new_files": c["new_files"], "deleted": [m["scripts"][g]["path"] for g in c["deleted"]],
         "renamed": [[r["from"], r["to"]] for r in c["renames"]],
         "new_folders": c["new_folders"], "renamed_folders": [[r["from"], r["to"]] for r in c["group_renames"]],
         "deleted_folders": [m["groups"][g]["folder"] for g in c["deleted_groups"]],
         "warnings": c["warnings"], "clean": not (c["modified"] or c["new_files"] or c["deleted"] or c["renames"]
                                                  or c["new_folders"] or c["group_renames"] or c["deleted_groups"])})


def cmd_push_plan(a):
    m = load_manifest(a.root)
    d, mode = m["dialect"], m["hash_mode"]
    types = json.loads(a.types) if a.types else {}
    groups, scripts, other = load_inventory(a.inventory, mode, a.inbox)
    c = local_changes(a.root, m)
    files = c["files"]
    force = set(a.force_paths or [])
    conflicts, need_type, info = [], [], []
    # !INC Carpeta.Script que se rompen al renombrar/mover o borrar
    refs = {}
    for r in c["renames"]:
        refs[r["guid"]] = "renombras/mueves"
    for g in c["deleted"]:
        refs[g] = "borras"
    for r in c["group_renames"]:
        for g, v in m["scripts"].items():
            if v["group"] == r["guid"]:
                refs.setdefault(g, "renombras la carpeta de")
    texts_local = {}
    for p, full in files.items():
        try:
            texts_local[p] = read_text(full)
        except (OSError, UnicodeDecodeError):
            pass
    for g, why in refs.items():
        sc = m["scripts"][g]
        inc = "!INC %s.%s" % (m["groups"][sc["group"]]["name"], sc["name"]) if sc["group"] in m["groups"] else None
        users = [p for p, t in texts_local.items() if inc and re.search(re.escape(inc) + r"\s*$", t, re.M)]
        if users:
            info.append("OJO: %s '%s' y estos scripts lo incluyen con '%s': %s" % (why, sc["path"], inc, ", ".join(users)))

    def check_script(g, why):
        sc, srv = m["scripts"][g], scripts.get(g)
        if srv is None:
            conflicts.append({"path": sc["path"], "action": why, "reason": "borrado en EA después de tu última bajada"})
        elif srv["h"] is None:
            conflicts.append({"path": sc["path"], "action": why, "reason": "no se pudo verificar (falta contenido en inbox)"})
        elif srv["h"] != sc["hash"]:
            if why == "actualizar" and c["cur_path"](sc) in force:
                info.append("Se sobrescribe a propósito la versión de EA: %s" % c["cur_path"](sc))
            else:
                conflicts.append({"path": c["cur_path"](sc), "action": why, "guid": g,
                                  "reason": "modificado en EA después de tu última bajada"})
        elif srv["notes"] != sc["notes"] or srv["group"] != sc["group"]:
            conflicts.append({"path": sc["path"], "action": why, "guid": g,
                              "reason": "renombrado o movido en EA después de tu última bajada"})

    for g in c["modified"]:
        check_script(g, "actualizar")
    for r in c["renames"]:
        check_script(r["guid"], "renombrar/mover")
    for g in c["deleted"]:
        check_script(g, "borrar en EA")
    for r in c["group_renames"]:
        if r["guid"] not in groups or groups[r["guid"]]["name"] != m["groups"][r["guid"]]["name"]:
            conflicts.append({"path": r["from"], "action": "renombrar carpeta", "reason": "la carpeta cambió en EA"})
    for g in c["deleted_groups"]:
        extra = [s for s, v in scripts.items() if v["group"] == g and s not in m["scripts"]]
        if extra:
            conflicts.append({"path": m["groups"][g]["folder"], "action": "borrar carpeta en EA",
                              "reason": "EA tiene scripts nuevos en esa carpeta que no has bajado",
                              "scripts": [scripts[s]["name"] for s in extra]})
    ea_names = {(v["group"], v["name"].lower()) for s, v in scripts.items() if s not in m["scripts"]}
    ea_gnames = {v["name"].lower() for g, v in groups.items() if g not in m["groups"]}
    for f in c["new_folders"]:
        if dec_name(f).lower() in ea_gnames:
            conflicts.append({"path": f, "action": "crear carpeta", "reason": "ya existe una carpeta con ese nombre en EA (no bajada)"})
        if f not in types:
            need_type.append(f)
        elif types[f] not in ("NORMAL", "PROJBROWSER", "DIAGRAM", "WORKFLOW", "SEARCH") and not a.allow_any_type:
            need_type.append(f)
    for p in c["new_files"]:
        f = p.split("/")[0]
        g = c["gby_folder"].get(f)
        stem = os.path.splitext(p.split("/", 1)[1])[0]
        if g and (g, dec_name(stem).lower()) in ea_names:
            conflicts.append({"path": p, "action": "crear script", "reason": "ya existe un script con ese nombre en EA (no bajado)"})
    for s, v in scripts.items():
        if s not in m["scripts"]:
            info.append("Nuevo en EA, aún no bajado: %s" % v["name"])
        elif v["h"] is not None and v["h"] != m["scripts"][s]["hash"] and s not in c["modified"] \
                and s not in c["deleted"] and s not in [r["guid"] for r in c["renames"]]:
            info.append("Cambió en EA y no lo tocaste local (no se sube, conviene bajar): %s" % m["scripts"][s]["path"])
    if conflicts or need_type:
        out({"ok": False, "conflicts": conflicts, "new_folders_need_type": need_type, "info": info,
             "warnings": c["warnings"]})
        sys.exit(2)

    steps, expected, exp_groups, del_scripts, del_groups = [], {}, {}, [], []
    gid_of_folder = dict(c["gby_folder"])
    for f in c["new_folders"]:
        g = new_guid()
        notes = '<Group Type="%s" Notes=""/>' % types[f]
        name = dec_name(f)
        steps.append({"desc": "Crear carpeta '%s' (%s)" % (name, types[f]), "sql": [
            "INSERT INTO t_script (ScriptCategory, ScriptName, ScriptAuthor, Notes, Script) VALUES ('%s', '%s', NULL, %s, %s)"
            % (GROUP_CAT, g, lit(d, notes), lit(d, name))]})
        gid_of_folder[f] = g
        exp_groups[g] = {"name": name, "type": types[f], "notes": notes, "folder": f}
    for r in c["group_renames"]:
        name = dec_name(r["to"])
        steps.append({"desc": "Renombrar carpeta '%s' -> '%s'" % (m["groups"][r["guid"]]["name"], name), "sql": [
            "UPDATE t_script SET Script = %s WHERE ScriptName = '%s' AND ScriptCategory = '%s'"
            % (lit(d, name), r["guid"], GROUP_CAT)]})
        eg = dict(m["groups"][r["guid"]])
        eg.update({"name": name, "folder": r["to"]})
        exp_groups[r["guid"]] = eg
    for p in c["new_files"]:
        f, fn = p.split("/", 1)
        stem, ext = os.path.splitext(fn)
        lang = EXT_LANG[ext.lower()]
        if lang == "JScript" and a.javascript and p in a.javascript:
            lang = "JavaScript"
        name = dec_name(stem)
        g = new_guid()
        notes = '<Script Name="%s" Type="Internal" Language="%s"/>' % (xml_attr(name), lang)
        text = read_text(files[p])
        empty = {"SQLSVR": NV, "POSTGRES": "''", "ORACLE": "EMPTY_CLOB()"}[d]
        sql = ["INSERT INTO t_script (ScriptCategory, ScriptName, ScriptAuthor, Notes, Script) VALUES ('%s', '%s', '%s', %s, %s)"
               % (SCRIPT_CAT, g, gid_of_folder[f], lit(d, notes), empty)]
        if text:
            sql += content_sql(d, g, text, a.chunk)
        steps.append({"desc": "Crear script '%s' en '%s' (%s)" % (name, dec_name(f), lang), "sql": sql})
        expected[g] = {"name": name, "lang": lang, "notes": notes, "group": gid_of_folder[f], "path": p,
                       "hash": dbhash(text, mode), "sha": dbhash(text, "utf8"), "len": u16len(text)}
    for g in c["modified"]:
        sc = dict(m["scripts"][g])
        cp = c["cur_path"](sc)
        text = read_text(files[cp])
        steps.append({"desc": "Actualizar '%s'" % cp, "sql": content_sql(d, g, text, a.chunk)})
        sc.update({"path": cp, "hash": dbhash(text, mode), "sha": dbhash(text, "utf8"), "len": u16len(text)})
        expected[g] = sc
    for r in c["renames"]:
        g = r["guid"]
        sc = dict(m["scripts"][g])
        f, fn = r["to"].split("/", 1)
        name = dec_name(os.path.splitext(fn)[0])
        notes = set_name_attr(sc["notes"], name)
        steps.append({"desc": "Renombrar/mover '%s' -> '%s'" % (r["from"], r["to"]), "sql": [
            "UPDATE t_script SET Notes = %s, ScriptAuthor = '%s' WHERE ScriptName = '%s' AND ScriptCategory = '%s'"
            % (lit(d, notes), gid_of_folder[f], g, SCRIPT_CAT)]})
        sc.update({"name": name, "notes": notes, "group": gid_of_folder[f], "path": r["to"]})
        expected[g] = sc
    for g in c["deleted"]:
        steps.append({"desc": "BORRAR en EA el script '%s'" % m["scripts"][g]["path"], "delete": True, "sql": [
            "DELETE FROM t_script WHERE ScriptName = '%s' AND ScriptCategory = '%s'" % (g, SCRIPT_CAT)]})
        del_scripts.append(g)
    for g in c["deleted_groups"]:
        steps.append({"desc": "BORRAR en EA la carpeta '%s'" % m["groups"][g]["name"], "delete": True, "sql": [
            "DELETE FROM t_script WHERE ScriptName = '%s' AND ScriptCategory = '%s'" % (g, GROUP_CAT)]})
        del_groups.append(g)
    pending = {"created": now(), "steps": steps, "expected": expected, "expected_groups": exp_groups,
               "delete_scripts": del_scripts, "delete_groups": del_groups,
               "folder_remap": {r["from"]: r["to"] for r in c["group_renames"]}}
    with open(P(a.root, ".ea-sync", "pending-push.json"), "w", encoding="utf-8", newline="\n") as fh:
        json.dump(pending, fh, ensure_ascii=False, indent=1)
    out({"ok": True, "steps": [{"i": i, "desc": s["desc"], "statements": len(s["sql"]), "delete": s.get("delete", False)}
                               for i, s in enumerate(steps)],
         "has_deletes": bool(del_scripts or del_groups), "info": info, "warnings": c["warnings"]})


def cmd_push_sql(a):
    pend = json.load(open(P(a.root, ".ea-sync", "pending-push.json"), encoding="utf-8"))
    s = pend["steps"][a.step]
    out({"i": a.step, "desc": s["desc"], "sql": s["sql"]}, True)


def cmd_push_verify(a):
    m = load_manifest(a.root)
    mode = m["hash_mode"]
    pend = json.load(open(P(a.root, ".ea-sync", "pending-push.json"), encoding="utf-8"))
    groups, scripts, other = load_inventory(a.inventory, mode, a.inbox)
    bad = []
    for g, e in pend["expected"].items():
        s = scripts.get(g)
        if s is None:
            bad.append({"path": e["path"], "problem": "no existe en EA"})
            continue
        if mode == "none":
            if s["h"] is None and s["len"] != e.get("len", s["len"]) and m["dialect"] != "ORACLE":
                bad.append({"path": e["path"], "problem": "longitud distinta", "ea": s["len"], "local": e.get("len")})
            elif s["h"] is not None and s["h"] != e["hash"]:
                bad.append({"path": e["path"], "problem": "contenido distinto"})
        elif s["h"] != e["hash"]:
            bad.append({"path": e["path"], "problem": "hash distinto", "ea": s["h"], "local": e["hash"]})
        if s["notes"] != e["notes"] or s["group"] != e["group"]:
            bad.append({"path": e["path"], "problem": "nombre/carpeta distinto en EA"})
    for g, e in pend["expected_groups"].items():
        if g not in groups or groups[g]["name"] != e["name"]:
            bad.append({"path": e["folder"], "problem": "carpeta no quedó como se esperaba"})
    for g in pend["delete_scripts"]:
        if g in scripts:
            bad.append({"path": m["scripts"][g]["path"], "problem": "sigue existiendo en EA"})
    for g in pend["delete_groups"]:
        if g in groups:
            bad.append({"path": m["groups"][g]["folder"], "problem": "la carpeta sigue existiendo en EA"})
    if bad:
        out({"ok": False, "mismatches": bad})
        sys.exit(3)
    for g, e in pend["expected_groups"].items():
        m["groups"][g] = e
    for g in pend["delete_groups"]:
        m["groups"].pop(g, None)
    remap = pend.get("folder_remap", {})
    for g, sc in m["scripts"].items():
        f, rest = sc["path"].split("/", 1)
        if f in remap:
            sc["path"] = remap[f] + "/" + rest
    for g, e in pend["expected"].items():
        e = dict(e)
        e.pop("len", None)
        m["scripts"][g] = e
    for g in pend["delete_scripts"]:
        m["scripts"].pop(g, None)
    m["last_push"] = now()
    save_manifest(a.root, m)
    pend["applied"] = now()
    with open(P(a.root, ".ea-sync", "pending-push.json"), "w", encoding="utf-8", newline="\n") as fh:
        json.dump(pend, fh, ensure_ascii=False, indent=1)
    out({"ok": True, "updated": len(pend["expected"]), "deleted_scripts": len(pend["delete_scripts"]),
         "deleted_groups": len(pend["delete_groups"])})


def main():
    ap = argparse.ArgumentParser(prog="easync")
    sp = ap.add_subparsers(dest="cmd")
    x = sp.add_parser("version")
    x = sp.add_parser("init"); x.add_argument("root"); x.add_argument("--client", required=True)
    x.add_argument("--dialect", required=True); x.add_argument("--hash-mode", required=True)
    x.add_argument("--fingerprint", required=True, help="JSON con los GUID de los paquetes raíz")
    x.add_argument("--connection", default=""); x.add_argument("--force", action="store_true")
    x = sp.add_parser("check"); x.add_argument("root"); x.add_argument("--fingerprint", required=True)
    x = sp.add_parser("sql-inventory"); x.add_argument("root"); x.add_argument("--dialect"); x.add_argument("--hash-mode")
    x = sp.add_parser("sql-fetch"); x.add_argument("root"); x.add_argument("guids", nargs="+")
    x.add_argument("--start", type=int); x.add_argument("--n", type=int)
    x = sp.add_parser("plan-pull"); x.add_argument("root"); x.add_argument("inventory")
    x = sp.add_parser("apply-pull"); x.add_argument("root"); x.add_argument("inventory"); x.add_argument("inbox")
    x = sp.add_parser("status"); x.add_argument("root")
    x = sp.add_parser("push-plan"); x.add_argument("root"); x.add_argument("inventory")
    x.add_argument("--types", help='JSON {"Carpeta nueva": "NORMAL"}'); x.add_argument("--inbox")
    x.add_argument("--chunk", type=int, default=8000); x.add_argument("--javascript", nargs="*")
    x.add_argument("--allow-any-type", action="store_true")
    x.add_argument("--force-paths", nargs="*", help="rutas en conflicto (modificadas en EA) que sí quieres sobrescribir")
    x = sp.add_parser("push-sql"); x.add_argument("root"); x.add_argument("step", type=int)
    x = sp.add_parser("push-verify"); x.add_argument("root"); x.add_argument("inventory"); x.add_argument("--inbox")
    a = ap.parse_args()
    if a.cmd == "version":
        print(VERSION); return
    if not a.cmd:
        ap.print_help(); return
    globals()["cmd_" + a.cmd.replace("-", "_")](a)


if __name__ == "__main__":
    main()
