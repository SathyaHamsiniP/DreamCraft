"""Separate clear upward triangles attached to a platform's top rail."""
import cv2
import numpy as np


def split_supported_shapes(mask):
    """Return local boxes only when two rails, sides and triangles agree."""
    h, w = mask.shape
    if w < 40 or h < 20:
        return None
    lines = cv2.HoughLinesP(mask, 1, np.pi/180, max(15, w//5),
                            minLineLength=int(w*.6), maxLineGap=max(4, w//40))
    if lines is None:
        return None
    rails = []
    for x1, y1, x2, y2 in np.asarray(lines).reshape(-1, 4):
        if abs(y2-y1) <= max(2, abs(x2-x1)*.04):
            rails.append((y1+y2)/2)
    groups = []
    for y in sorted(rails):
        if groups and y - np.mean(groups[-1]) <= max(4, h*.05):
            groups[-1].append(y)
        else:
            groups.append([y])
    rails = [int(round(np.mean(g))) for g in groups]
    if len(rails) != 2:
        return None
    top, bottom = rails
    if top < max(8, h*.2) or bottom < h*.85 or not 6 <= bottom-top <= w*.4:
        return None
    # A rail across the bottom of a scribble is not enough to infer a platform.
    side = max(3, int(w*.04))
    middle = mask[top:bottom+1]
    if min(np.mean(np.any(middle[:, :side], axis=1)), np.mean(np.any(middle[:, -side:], axis=1))) < .7:
        return None
    distance = cv2.distanceTransform(mask, cv2.DIST_L2, 3)
    stroke = max(2, min(10, int(round(np.median(distance[mask > 0])*2))))
    cut = max(1, top-stroke)
    contours, _ = cv2.findContours(mask[:cut].copy(), cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    triangles = []
    for contour in contours:
        x, y, cw, ch = cv2.boundingRect(contour)
        if cw < 8 or ch < 8:
            return None
        hull = cv2.convexHull(contour)
        vertices = cv2.approxPolyDP(hull, .045*cv2.arcLength(hull, True), True).reshape(-1, 2)
        if len(vertices) != 3 or not .4 <= cw/ch <= 2.5:
            return None
        apex = vertices[np.argmin(vertices[:, 1])]
        feet = vertices[np.argsort(vertices[:, 1])[-2:]]
        if not x+cw*.2 <= apex[0] <= x+cw*.8 or np.min(feet[:,1]) < cut-max(stroke*2, ch*.15):
            return None
        # Keep the observed base pixels shared with the rail; do not draw a new base.
        triangles.append(dict(x=max(0,x-2), y=max(0,y-2), width=min(w,x+cw+2)-max(0,x-2),
                              height=min(h,top+stroke)-max(0,y-2)))
    if not 1 <= len(triangles) <= 4:
        return None
    return triangles + [dict(x=0, y=max(0,top-stroke), width=w, height=h-max(0,top-stroke))]
