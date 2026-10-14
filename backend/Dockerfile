FROM eclipse-temurin:21.0.12.1_1-jdk-noble AS build
WORKDIR /app

COPY .mvn .mvn
COPY mvnw pom.xml ./
RUN ./mvnw -q -Dmaven.test.skip=true dependency:go-offline

COPY src src
RUN ./mvnw -q -Dmaven.test.skip=true package

FROM eclipse-temurin:21.0.12.1_1-jre-noble
WORKDIR /app
COPY --from=build /app/target/backend-0.0.1-SNAPSHOT.jar app.jar
USER 10001:10001
EXPOSE 8080
ENTRYPOINT ["java", "-jar", "/app/app.jar"]
