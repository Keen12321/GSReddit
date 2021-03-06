import { Resolver, Arg, InputType, Field, Ctx, Mutation, ObjectType, Query } from 'type-graphql';
import { MyContext } from '../types';
import { User } from '../entities/User';
import argon2 from 'argon2';

@InputType()
class UsernamePasswordInput {
    @Field()
    username: string
    @Field()
    password: string
}

@ObjectType()
class FieldError {
    @Field()
    field: string
    @Field()
    message: string
}

@ObjectType()
class UserResponse {
    @Field(() => [FieldError], { nullable: true })
    errors?: Error[]

    @Field(() => User, { nullable: true })
    user?: User
}

@Resolver()
export class UserResolver {
    @Query(() => User, { nullable: true })
    async me(@Ctx() { req, em }: MyContext) {
        if (!req.session.userId) {
            return null;
        }

        const user = await em.findOne(User, { id: req.session.userId });
        return user;
    }

    @Mutation(() => UserResponse)
    async register(
        @Arg('options') options: UsernamePasswordInput,
        @Ctx() { em, req }: MyContext
    ) {
        if (options.username.length <= 2) {
            return {
                errors: [{
                    field: "username",
                    message: "Username is not long enough"
                }]
            }
        }
        if (options.password.length <= 2) {
            return {
                errors: [{
                    field: "password",
                    message: "Password is not long enough"
                }]
            }
        }

        const hashedPassword = await argon2.hash(options.password)
        const user = em.create(User, { username: options.username, password: hashedPassword })

        try {
            await em.persistAndFlush(user);
        } catch(error) {
            if (error.code === '23505') {
                return {
                    errors: [
                        {
                            field: "username",
                            message: "username already taken"
                        }
                    ]
                }
            }
        }

        // store user id session
        req.session.userId = user.id;

        return { user } ;
    }

    @Mutation(() => UserResponse)
    async login(
        @Arg('options') options: UsernamePasswordInput,
        @Ctx() { em, req }: MyContext
    ) {
        const user = await em.findOne(User, { username: options.username.toLowerCase(), password: options.password })
        if (!user) {
            return {
                errors: [{
                    field: "username",
                    message: "That username doesn't exist"
                }]
            }
        }
        const valid = await argon2.verify(user.password, options.password)
        if (!valid) {
            return {
                errors: [
                    {
                        field: "login",
                        message: "Incorrect Login"
                    }
                ]
            }
        }

        req.session.userId = user.id;

        return { user };
    }
}