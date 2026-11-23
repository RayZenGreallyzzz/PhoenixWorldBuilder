"""Rebuild the 2.1.26 WebView update using the original compiled 2.1.24 shell.

Copy unchanged compressed payloads verbatim, align stored files and attach the
offline APK v2 signature only to its exact, pre-authorized unsigned digest.
"""
import argparse
import hashlib
import struct
import zlib
from pathlib import Path
from zipfile import ZipFile, ZIP_STORED

HERE = Path(__file__).resolve().parent
BASE_SHA = '5b753b5932bcc21c7f019ad2a30e7d461bf6c0109d487c73ef17cea73543f75a'
AUDIO = 'assets/engine/runtime/phoenix-audio.js'
VERSION = 'assets/engine/runtime/phoenix-version.js'
MANIFEST = 'AndroidManifest.xml'


def replace_once(data, before, after):
    if data.count(before) != 1:
        raise ValueError('Unexpected base release metadata')
    return data.replace(before, after)


def manifest_update(data):
    # At this offset in the pinned binary XML the root element has the typed
    # integer android:versionCode. All other manifest attributes stay intact.
    old_value = struct.pack('<HBBI', 8, 0, 0x10, 54)
    data = replace_once(data, old_value, struct.pack('<HBBI', 8, 0, 0x10, 56))
    return replace_once(data, '2.1.24'.encode('utf-16le'), '2.1.26'.encode('utf-16le'))


def unsigned_apk(base, audio):
    source = base.read_bytes()
    if hashlib.sha256(source).hexdigest() != BASE_SHA:
        raise ValueError('Expected the original signed Phoenix Engine 2.1.24')
    output = bytearray()
    directory = bytearray()
    with ZipFile(base) as archive:
        replacements = {
            AUDIO: audio.read_bytes(),
            MANIFEST: manifest_update(archive.read(MANIFEST)),
            VERSION: replace_once(archive.read(VERSION), b"'2.1.24',code=54", b"'2.1.26',code=56"),
        }
        entries = archive.infolist()
        for entry in entries:
            name = entry.filename.encode('utf-8')
            if entry.filename in replacements:
                payload = replacements[entry.filename]
                size, method, crc = len(payload), ZIP_STORED, zlib.crc32(payload)
            else:
                start = entry.header_offset
                name_len, extra_len = struct.unpack_from('<HH', source, start + 26)
                start += 30 + name_len + extra_len
                payload = source[start:start + entry.compress_size]
                size, method, crc = entry.file_size, entry.compress_type, entry.CRC
            offset = len(output)
            extra = b''
            if method == ZIP_STORED:
                padding = (-(offset + 30 + len(name) + 6)) % 4
                extra = struct.pack('<HHH', 0xd935, 2 + padding, 4) + bytes(padding)
            fields = (20, 0x800, method, 0, 33, crc, len(payload), size, len(name))
            output.extend(struct.pack('<I5H3I2H', 0x04034b50, *fields, len(extra)))
            output.extend(name + extra + payload)
            directory.extend(struct.pack('<I6H3I5H2I', 0x02014b50, 20, *fields,
                                         0, 0, 0, 0, 0, offset))
            directory.extend(name)
    central_offset = len(output)
    output.extend(directory)
    output.extend(struct.pack('<I4H2IH', 0x06054b50, 0, 0, len(entries), len(entries),
                              len(directory), central_offset, 0))
    return output, central_offset


def build(base, dest, signed):
    raw, offset = unsigned_apk(base, HERE / 'phoenix-audio.js')
    if signed:
        digest = hashlib.sha256(raw).hexdigest()
        if digest != (HERE / 'unsigned.sha256').read_text().strip():
            raise ValueError('Refusing to attach a signature for different APK contents')
        block = (HERE / 'release.v2sig').read_bytes()
        struct.pack_into('<I', raw, len(raw) - 6, offset + len(block))
        raw[offset:offset] = block
        if hashlib.sha256(raw).hexdigest() != (HERE / 'release.sha256').read_text().strip():
            raise ValueError('Unexpected signed release digest')
    dest.write_bytes(raw)


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('base', type=Path)
    parser.add_argument('output', type=Path)
    parser.add_argument('--unsigned', action='store_true')
    options = parser.parse_args()
    build(options.base, options.output, not options.unsigned)
