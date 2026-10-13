FROM python:3.12-slim
RUN pip install --no-cache-dir numpy==2.3.5 scipy==1.17.0 pandas==2.3.3 matplotlib==3.10.7
ENV MPLCONFIGDIR=/tmp/matplotlib PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1
WORKDIR /output
USER 65534:65534
