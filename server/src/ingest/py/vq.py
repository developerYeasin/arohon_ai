# render one page as 4 readable quarters (2 columns x top/bottom) for reading by eye
import os, sys, pymupdf
from extract import connect, SOURCE
fid, no = int(sys.argv[1]), int(sys.argv[2])
c = connect().cursor()
c.execute('SELECT path FROM ingest_files WHERE id=%s', (fid,))
pg = pymupdf.open(os.path.join(SOURCE, c.fetchone()[0]))[no - 1]
w, h = pg.rect.width, pg.rect.height
for i, b in enumerate(((0, .03, .5, .53), (0, .5, .5, .97), (.5, .03, 1, .53), (.5, .5, 1, .97))):
    pg.get_pixmap(dpi=130 * 595 / max(w, 1) if w > 900 else 130, clip=pymupdf.Rect(b[0]*w, b[1]*h, b[2]*w, b[3]*h),
                  colorspace=pymupdf.csGRAY).save(os.path.join(os.environ['TEMP'], 'claude', f'v{i}.jpg'), jpg_quality=75)
c.execute('SELECT id, text_status FROM ingest_pages WHERE file_id=%s AND page_no=%s', (fid, no))
print(c.fetchone())
